/**
 * The sync engine (6.5, 9.6): one run at a time, coalesced triggers, token handling,
 * pairing and the status store. Framework-free, so a background task can use it later.
 */
import { authMessage, formatPairingCode, isValidPairingCode, normalizePairingCode, pairingMessage } from '../crypto/protocol';
import { ApiClient, ApiError, NetworkError } from './api';
import {
  chunk,
  countDeleteConflicts,
  planEntryPushResult,
  planProfilePushResult,
  planPulledEntry,
  planPulledProfile,
  PUSH_BATCH_SIZE,
  splitDirtyEntries,
  toEntryChange,
  toProfileChange
} from './merge';
import { parseServerUrl } from './serverUrl';
import { INITIAL_SNAPSHOT, SyncSnapshot, SyncStatus } from './status';
import type { SyncState, SyncStore } from './store';
import type { DeviceInfo, HealthResponse, PairingCodeResponse } from './types';
import { isUpdateAvailable, isUpdateRequired } from './versions';

export const LOCAL_CHANGE_DEBOUNCE_MS = 2_000;

/** Tokens are renewed a minute before they expire. */
const TOKEN_RENEWAL_MARGIN_MS = 60_000;

export interface DeviceKey {
  getOrCreateKey(): Promise<void>;
  publicKeySpkiBase64(): Promise<string>;
  sign(message: string): Promise<string>;
  deleteKey(): Promise<void>;
}

export interface SyncPlatform {
  appVersion: string;
  /** Development builds also accept http:// server URLs (7.1). */
  allowHttp: boolean;
  /** Whether the Android local network permission is denied, which makes LAN connections time out (9.4). */
  isLocalNetworkPermissionDenied(): Promise<boolean>;
  /** Called after pairing, e.g. to ask the browser to persist the storage (9.5). */
  onPaired(): Promise<void>;
}

export interface SyncEngineOptions {
  store: SyncStore;
  deviceKey: DeviceKey;
  createApi: (baseUrl: string) => ApiClient;
  platform: SyncPlatform;
  now?: () => Date;
}

/** Thrown by `pair` for a code that cannot be valid, before anything is sent. */
export class InvalidPairingCodeError extends Error {
  constructor() {
    super('Enter the 8-character code, e.g. 7K2M-QX9D');
    this.name = 'InvalidPairingCodeError';
  }
}

/** Thrown by `pair` when the server requires a newer app. */
export class UpdateRequiredError extends Error {
  constructor() {
    super('Update required to sync');
    this.name = 'UpdateRequiredError';
  }
}

type PairedState = SyncState & { serverUrl: string; serverId: string; deviceId: string };

interface AccessToken {
  value: string;
  expiresAt: number;
  serverUrl: string;
}

export class SyncEngine {
  private readonly store: SyncStore;
  private readonly deviceKey: DeviceKey;
  private readonly createApi: (baseUrl: string) => ApiClient;
  private readonly platform: SyncPlatform;
  private readonly now: () => Date;

  private snapshot: SyncSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private token: AccessToken | null = null;
  private running: Promise<void> | null = null;
  private rerunRequested = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SyncEngineOptions) {
    this.store = options.store;
    this.deviceKey = options.deviceKey;
    this.createApi = options.createApi;
    this.platform = options.platform;
    this.now = options.now ?? (() => new Date());
  }

  // Status store, for useSyncExternalStore

  getSnapshot = (): SyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  acknowledgeSkippedDeletions(): void {
    this.update({ skippedDeletions: 0 });
  }

  // Triggers

  /**
   * Runs a sync now. Only one run happens at a time; requests during a run coalesce
   * into one follow-up run.
   */
  requestSync(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerunRequested = false;
        await this.runOnce();
      } while (this.rerunRequested);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Called after every local write: updates the waiting count and syncs 2 s after the last change. */
  notifyLocalChange(): void {
    void this.refreshWaiting();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.requestSync();
    }, LOCAL_CHANGE_DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.listeners.clear();
  }

  // Pairing (7.3) and disconnect (7.5)

  /** Health check of a server before pairing. Throws ApiError, NetworkError or UpdateRequiredError. */
  async checkServer(url: string): Promise<HealthResponse> {
    const health = await this.createApi(this.validateUrl(url)).health();
    if (isUpdateRequired(health, this.platform.appVersion)) {
      throw new UpdateRequiredError();
    }
    return health;
  }

  async pair(url: string, code: string, deviceName: string): Promise<void> {
    const serverUrl = this.validateUrl(url);
    const normalizedCode = normalizePairingCode(code);
    if (!isValidPairingCode(normalizedCode)) {
      throw new InvalidPairingCodeError();
    }

    const api = this.createApi(serverUrl);
    const health = await this.checkServer(serverUrl);
    await this.deviceKey.getOrCreateKey();
    const publicKey = await this.deviceKey.publicKeySpkiBase64();
    const signature = await this.deviceKey.sign(pairingMessage(health.serverId, normalizedCode, publicKey));
    const paired = await api.pair({
      code: formatPairingCode(normalizedCode),
      deviceName: deviceName.trim(),
      publicKey,
      signature
    });

    // A different server (or the first one): upload everything before pulling (6.5)
    const previous = await this.store.getSyncState();
    if (previous.serverId !== paired.serverId) {
      await this.store.resetForNewServer();
    }
    await this.store.updateSyncState({
      serverUrl,
      serverId: paired.serverId,
      deviceId: paired.deviceId,
      deviceName: deviceName.trim(),
      lastError: null
    });
    this.token = null;
    await this.platform.onPaired();
    void this.requestSync();
  }

  /** Forgets the server URL, serverId, deviceId, cursor, token and device key. Local data is kept. */
  async disconnect(): Promise<void> {
    await this.store.clearSyncState();
    await this.deviceKey.deleteKey();
    this.token = null;
    this.update({ ...INITIAL_SNAPSHOT, waiting: await this.store.countDirty() });
  }

  // Devices (7.5)

  async listDevices(): Promise<DeviceInfo[]> {
    return this.withSession((api, state) => this.authorized(api, state, (token) => api.listDevices(token)));
  }

  /** Revokes a device. Revoking this device disconnects it. */
  async revokeDevice(deviceId: string): Promise<void> {
    const isSelf = await this.withSession(async (api, state) => {
      await this.authorized(api, state, (token) => api.revokeDevice(deviceId, token));
      return deviceId === state.deviceId;
    });
    if (isSelf) {
      await this.disconnect();
    }
  }

  async createPairingCode(): Promise<PairingCodeResponse> {
    return this.withSession((api, state) => this.authorized(api, state, (token) => api.createPairingCode(token)));
  }

  // One run (6.5)

  private async runOnce(): Promise<void> {
    const state = await this.store.getSyncState();
    if (!isPaired(state)) {
      this.update({ status: { state: 'disabled' }, serverUrl: null, waiting: await this.store.countDirty() });
      return;
    }

    this.update({ status: { state: 'syncing' }, serverUrl: state.serverUrl });
    const api = this.createApi(state.serverUrl);
    try {
      const health = await api.health();
      if (health.serverId !== state.serverId) {
        this.token = null;
        await this.finish({ state: 'needsPairing', reason: 'serverChanged' });
        return;
      }
      this.update({
        serverVersion: health.serverVersion,
        updateAvailable: isUpdateAvailable(health, this.platform.appVersion)
      });
      if (isUpdateRequired(health, this.platform.appVersion)) {
        await this.finish({ state: 'updateRequired' });
        return;
      }

      const skippedDeletions = await this.push(api, state);
      await this.pull(api, state);

      const lastSyncAt = this.now().toISOString();
      await this.store.updateSyncState({ lastSyncAt, lastError: null });
      this.update({ lastSyncAt, skippedDeletions: this.snapshot.skippedDeletions + skippedDeletions });
      await this.finish({ state: 'idle' });
    } catch (error) {
      await this.finish(await this.statusForError(error));
    }
  }

  private async push(api: ApiClient, state: PairedState): Promise<number> {
    const { purge, push } = splitDirtyEntries(await this.store.getDirtyEntries());
    await this.store.purgeEntries(purge);

    const localProfile = await this.store.getProfile();
    const profileSnapshot = localProfile?.dirty ? localProfile : null;
    const batches = chunk(push, PUSH_BATCH_SIZE);
    if (batches.length === 0 && profileSnapshot) {
      batches.push([]);
    }

    let skippedDeletions = 0;
    for (const [index, batch] of batches.entries()) {
      const profile = index === 0 ? profileSnapshot : null;
      const response = await this.authorized(api, state, (token) =>
        api.push({ entries: batch.map(toEntryChange), profile: profile && toProfileChange(profile) }, token)
      );

      const snapshots = byId(batch);
      const current = byId(await this.store.getEntries(batch.map((entry) => entry.id)));
      const actions = response.entries
        .map((result) => {
          const snapshot = snapshots.get(result.id);
          return snapshot ? planEntryPushResult(snapshot, current.get(result.id), result) : null;
        })
        .filter(isPresent);
      await this.store.applyEntryActions(actions);
      skippedDeletions += countDeleteConflicts(response.entries);

      if (profile && response.profile) {
        const action = planProfilePushResult(profile, await this.store.getProfile(), response.profile);
        if (action) {
          await this.store.applyProfileAction(action);
        }
      }
    }
    return skippedDeletions;
  }

  private async pull(api: ApiClient, state: PairedState): Promise<void> {
    let { cursor } = await this.store.getSyncState();
    let hasMore = true;
    while (hasMore) {
      const page = await this.authorized(api, state, (token) => api.pull(cursor, token));

      const locals = byId(await this.store.getEntries(page.entries.map((entry) => entry.id)));
      await this.store.applyEntryActions(
        page.entries.map((record) => planPulledEntry(locals.get(record.id), record)).filter(isPresent)
      );
      if (page.profile) {
        const action = planPulledProfile(await this.store.getProfile(), page.profile);
        if (action) {
          await this.store.applyProfileAction(action);
        }
      }

      // Persist the cursor after each page
      cursor = page.nextCursor;
      await this.store.updateSyncState({ cursor });
      hasMore = page.hasMore;
    }
  }

  // Authentication (7.4)

  /** Calls the API with an access token; re-authenticates and retries once if the token is rejected. */
  private async authorized<T>(api: ApiClient, state: PairedState, call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.getToken(api, state);
    try {
      return await call(token);
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'invalid_token' || error.code === 'token_expired')) {
        this.token = null;
        return call(await this.getToken(api, state));
      }
      throw error;
    }
  }

  private async getToken(api: ApiClient, state: PairedState): Promise<string> {
    const token = this.token;
    if (token && token.serverUrl === state.serverUrl && token.expiresAt - TOKEN_RENEWAL_MARGIN_MS > this.now().getTime()) {
      return token.value;
    }
    try {
      return await this.authenticate(api, state);
    } catch (error) {
      // A signature or challenge problem is retried once (8.4)
      if (error instanceof ApiError && (error.code === 'invalid_signature' || error.code === 'challenge_expired')) {
        return this.authenticate(api, state);
      }
      throw error;
    }
  }

  private async authenticate(api: ApiClient, state: PairedState): Promise<string> {
    const challenge = await api.challenge(state.deviceId);
    const signature = await this.deviceKey.sign(authMessage(state.serverId, state.deviceId, challenge.nonce));
    const response = await api.token({ deviceId: state.deviceId, nonce: challenge.nonce, signature });
    this.token = { value: response.accessToken, expiresAt: Date.parse(response.expiresAt), serverUrl: state.serverUrl };
    return response.accessToken;
  }

  // Helpers

  private async withSession<T>(action: (api: ApiClient, state: PairedState) => Promise<T>): Promise<T> {
    const state = await this.store.getSyncState();
    if (!isPaired(state)) {
      throw new Error('This device is not connected to a server');
    }
    try {
      return await action(this.createApi(state.serverUrl), state);
    } catch (error) {
      if (isUnknownDevice(error)) {
        this.token = null;
        this.update({ status: { state: 'needsPairing', reason: 'deviceRemoved' } });
      }
      throw error;
    }
  }

  private async statusForError(error: unknown): Promise<SyncStatus> {
    if (error instanceof NetworkError) {
      // Being unreachable is the normal "away" state, never an error (6.6)
      const reason = (await this.platform.isLocalNetworkPermissionDenied()) ? 'localNetworkPermission' : error.reason;
      return { state: 'offline', reason };
    }
    if (isUnknownDevice(error)) {
      this.token = null;
      return { state: 'needsPairing', reason: 'deviceRemoved' };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ApiError && error.code === 'validation_failed') {
      // The client validates with the same rules first, so this is a bug (8.4)
      console.warn('Sync push rejected as invalid:', message);
    }
    await this.store.updateSyncState({ lastError: message });
    return { state: 'error', message };
  }

  private async finish(status: SyncStatus): Promise<void> {
    this.update({ status, waiting: await this.store.countDirty() });
  }

  private async refreshWaiting(): Promise<void> {
    this.update({ waiting: await this.store.countDirty() });
  }

  private validateUrl(url: string): string {
    const parsed = parseServerUrl(url, this.platform.allowHttp);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.url;
  }

  private update(patch: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

function isPaired(state: SyncState): state is PairedState {
  return state.serverUrl !== null && state.serverId !== null && state.deviceId !== null;
}

function isUnknownDevice(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'unknown_device';
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
