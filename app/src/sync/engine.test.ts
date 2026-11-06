import type { LocalEntry, LocalProfile } from '../domain/types';
import { ApiClient, ApiError, NetworkError } from './api';
import { DeviceKey, InvalidPairingCodeError, SyncEngine, SyncPlatform } from './engine';
import type { EntryAction, ProfileAction } from './merge';
import { EMPTY_SYNC_STATE, SyncState, SyncStore } from './store';
import type { EntryPushResult, EntryRecord, HealthResponse, PushRequest } from './types';

const SERVER_ID = '6f1c2c4e-8a59-4d55-9f0e-4f0f5b0b9a11';

/** An in-memory SyncStore with the same guard semantics as db/syncStore.ts. */
class MemoryStore implements SyncStore {
  state: SyncState = { ...EMPTY_SYNC_STATE };
  entries = new Map<string, LocalEntry>();
  profile: LocalProfile | null = null;

  async getSyncState() {
    return { ...this.state };
  }
  async updateSyncState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
  }
  async clearSyncState() {
    this.state = { ...EMPTY_SYNC_STATE };
  }
  async getDirtyEntries() {
    return [...this.entries.values()].filter((entry) => entry.dirty);
  }
  async getEntries(ids: string[]) {
    return ids.map((id) => this.entries.get(id)).filter((entry): entry is LocalEntry => entry !== undefined);
  }
  async purgeEntries(ids: string[]) {
    ids.forEach((id) => this.entries.delete(id));
  }
  async applyEntryActions(actions: EntryAction[]) {
    for (const action of actions) {
      const row = this.entries.get(action.type === 'replace' || action.type === 'upsertPulled' ? action.entry.id : action.id);
      const guardHolds = 'expectedUpdatedAt' in action && row?.updatedAt === action.expectedUpdatedAt;
      switch (action.type) {
        case 'markSynced':
          if (row) this.entries.set(row.id, { ...row, version: action.version, dirty: guardHolds ? false : row.dirty });
          break;
        case 'rebase':
          if (row) this.entries.set(row.id, { ...row, version: action.version });
          break;
        case 'purge':
          if (row && guardHolds) this.entries.delete(row.id);
          else if (row) this.entries.set(row.id, { ...row, version: action.version });
          break;
        case 'replace':
          if (row && guardHolds) this.entries.set(row.id, action.entry);
          else if (row) this.entries.set(row.id, { ...row, version: action.entry.version });
          break;
        case 'upsertPulled':
          if (!row?.dirty) this.entries.set(action.entry.id, action.entry);
          break;
        case 'deletePulled':
          if (row && !row.dirty) this.entries.delete(row.id);
          break;
      }
    }
  }
  async getProfile() {
    return this.profile;
  }
  async applyProfileAction(action: ProfileAction) {
    const row = this.profile;
    if (action.type === 'upsertPulled') {
      if (!row?.dirty) this.profile = action.profile;
    } else if (row) {
      const guardHolds = action.type !== 'rebase' && row.updatedAt === action.expectedUpdatedAt;
      if (action.type === 'replace' && guardHolds) this.profile = action.profile;
      else if (action.type === 'markSynced' && guardHolds) this.profile = { ...row, version: action.version, dirty: false };
      else this.profile = { ...row, version: action.type === 'replace' ? action.profile.version : action.version };
    }
  }
  async countDirty() {
    return (await this.getDirtyEntries()).length + (this.profile?.dirty ? 1 : 0);
  }
  async resetForNewServer() {
    this.entries.forEach((entry, id) => this.entries.set(id, { ...entry, version: null, dirty: true }));
    if (this.profile) this.profile = { ...this.profile, version: null, dirty: true };
    this.state.cursor = 0;
  }
}

/** A minimal server: last-write-wins without conflicts unless a test overrides push. */
class FakeServer {
  serverId = SERVER_ID;
  records = new Map<string, EntryRecord>();
  lastSeq = 0;
  tokens = new Set<string>();
  calls: string[] = [];
  healthError: Error | null = null;
  pushOverride: ((request: PushRequest) => EntryPushResult[] | null) | null = null;

  api: ApiClient = {
    health: async (): Promise<HealthResponse> => {
      this.calls.push('health');
      if (this.healthError) throw this.healthError;
      return { status: 'ok', serverId: this.serverId, serverVersion: '0.2.0', apiVersion: 1, minAppVersion: '0.1.0' };
    },
    pair: async (request) => {
      this.calls.push(`pair ${request.code}`);
      return { deviceId: 'device-1', serverId: this.serverId };
    },
    challenge: async () => {
      this.calls.push('challenge');
      return { nonce: 'nonce', expiresAt: '2099-01-01T00:00:00.000Z' };
    },
    token: async () => {
      this.calls.push('token');
      const token = `token-${this.tokens.size + 1}`;
      this.tokens.add(token);
      return { accessToken: token, expiresAt: '2099-01-01T00:00:00.000Z' };
    },
    push: async (request, token) => {
      this.calls.push('push');
      this.checkToken(token);
      const results = this.pushOverride?.(request) ?? request.entries.map((change): EntryPushResult => {
        if (change.deleted && !this.records.has(change.id)) {
          return { id: change.id, status: 'applied', version: null, reason: null, current: null };
        }
        const { baseVersion: _base, ...fields } = change;
        const record = { ...fields, version: ++this.lastSeq };
        this.records.set(change.id, record);
        return { id: change.id, status: 'applied', version: record.version, reason: null, current: null };
      });
      return { entries: results, profile: request.profile ? { status: 'applied', version: ++this.lastSeq, reason: null, current: null } : null };
    },
    pull: async (cursor, token) => {
      this.calls.push(`pull ${cursor}`);
      this.checkToken(token);
      const entries = [...this.records.values()].filter((record) => record.version > cursor).sort((a, b) => a.version - b.version);
      const page = entries.slice(0, 2);
      return {
        entries: page,
        profile: null,
        nextCursor: page.length > 0 ? page[page.length - 1].version : cursor,
        hasMore: entries.length > page.length
      };
    },
    listDevices: async () => [],
    revokeDevice: async () => undefined,
    createPairingCode: async () => ({ code: 'ABCD-EFGH', expiresAt: '2099-01-01T00:00:00.000Z' })
  };

  private checkToken(token: string) {
    if (!this.tokens.has(token)) throw new ApiError(401, 'invalid_token', 'Invalid access token');
  }
}

const deviceKey: DeviceKey = {
  getOrCreateKey: jest.fn(async () => undefined),
  publicKeySpkiBase64: jest.fn(async () => 'public-key'),
  sign: jest.fn(async (message: string) => `signed:${message}`),
  deleteKey: jest.fn(async () => undefined)
};

const platform: SyncPlatform = {
  appVersion: '0.1.0',
  allowHttp: false,
  isLocalNetworkPermissionDenied: async () => false,
  onPaired: async () => undefined
};

const entry = (id: string, overrides: Partial<LocalEntry> = {}): LocalEntry => ({
  id,
  name: `Entry ${id}`,
  kcal: 100,
  proteinG: null,
  carbsG: null,
  fatG: null,
  fibreG: null,
  quantity: 1,
  mealType: null,
  notes: null,
  eatenAt: '2026-11-03T12:30:00+01:00',
  eatenLocalDate: '2026-11-03',
  loggedAt: '2026-11-03T11:30:00.000Z',
  updatedAt: '2026-11-03T11:30:00.000Z',
  deleted: false,
  version: null,
  dirty: true,
  ...overrides
});

function setup() {
  const store = new MemoryStore();
  const server = new FakeServer();
  const engine = new SyncEngine({
    store,
    deviceKey,
    createApi: () => server.api,
    platform,
    now: () => new Date('2026-11-03T12:00:00.000Z')
  });
  return { store, server, engine };
}

async function paired() {
  const context = setup();
  await context.engine.pair('https://kcal.example.com', '7k2m-qx9d', 'Pixel 9');
  await context.engine.requestSync();
  context.server.calls = [];
  return context;
}

describe('SyncEngine', () => {
  it('is disabled without a server', async () => {
    const { engine, store } = setup();
    store.entries.set('a', entry('a'));

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'disabled' });
    expect(engine.getSnapshot().waiting).toBe(1);
  });

  it('pairs with a normalized code and uploads all local data to a new server', async () => {
    const { engine, store, server } = setup();
    store.entries.set('a', entry('a', { version: 4, dirty: false }));
    store.state.cursor = 40;

    await engine.pair('https://kcal.example.com/', '7k2m qx9d', ' Pixel 9 ');
    await engine.requestSync();

    expect(server.calls).toContain('pair 7K2M-QX9D');
    expect(deviceKey.sign).toHaveBeenCalledWith(`kcal-pair-v1\n${SERVER_ID}\n7K2MQX9D\npublic-key`);
    expect(store.state).toMatchObject({ serverUrl: 'https://kcal.example.com', serverId: SERVER_ID, deviceId: 'device-1', deviceName: 'Pixel 9' });
    expect(server.records.has('a')).toBe(true);
    expect(store.entries.get('a')).toMatchObject({ dirty: false, version: 1 });
    expect(engine.getSnapshot().status).toEqual({ state: 'idle' });
    expect(engine.getSnapshot().lastSyncAt).toBe('2026-11-03T12:00:00.000Z');
  });

  it('rejects invalid pairing codes before contacting the server', async () => {
    const { engine, server } = setup();

    await expect(engine.pair('https://kcal.example.com', 'ABC', 'Phone')).rejects.toBeInstanceOf(InvalidPairingCodeError);
    expect(server.calls).toEqual([]);
  });

  it('rejects http:// URLs in release builds', async () => {
    const { engine } = setup();

    await expect(engine.pair('http://192.168.1.10:5080', '7K2M-QX9D', 'Phone')).rejects.toThrow('Only https://');
  });

  it('pushes, then pulls all pages and persists the cursor', async () => {
    const { engine, store, server } = await paired();
    store.entries.set('new', entry('new'));
    for (const id of ['x', 'y', 'z']) {
      server.records.set(id, { ...entry(id), version: ++server.lastSeq });
    }

    await engine.requestSync();

    expect(server.calls).toEqual(['health', 'push', 'pull 0', 'pull 2']);
    expect([...store.entries.keys()].sort()).toEqual(['new', 'x', 'y', 'z']);
    expect(store.entries.get('x')).toMatchObject({ dirty: false, version: 1 });
    expect(store.state.cursor).toBe(4);
  });

  it('purges never-synced deletes without pushing them and purges synced tombstones after push', async () => {
    const { engine, store, server } = await paired();
    store.entries.set('local-only', entry('local-only', { deleted: true }));
    server.records.set('synced', { ...entry('synced'), version: ++server.lastSeq });
    store.entries.set('synced', entry('synced', { version: server.lastSeq, deleted: true }));

    await engine.requestSync();

    expect(store.entries.size).toBe(0);
    expect(server.records.get('synced')?.deleted).toBe(true);
    expect(server.records.has('local-only')).toBe(false);
  });

  it('keeps the edit and reports a skipped deletion on deleteConflict', async () => {
    const { engine, store, server } = await paired();
    const current: EntryRecord = { ...entry('a'), name: 'Edited elsewhere', version: 9 };
    server.pushOverride = () => [{ id: 'a', status: 'rejected', version: 9, reason: 'deleteConflict', current }];
    store.entries.set('a', entry('a', { version: 5, deleted: true }));

    await engine.requestSync();

    expect(store.entries.get('a')).toMatchObject({ name: 'Edited elsewhere', deleted: false, dirty: false, version: 9 });
    expect(engine.getSnapshot().skippedDeletions).toBe(1);
    engine.acknowledgeSkippedDeletions();
    expect(engine.getSnapshot().skippedDeletions).toBe(0);
  });

  it('keeps a row dirty that changed while its push was in flight', async () => {
    const { engine, store, server } = await paired();
    store.entries.set('a', entry('a'));
    server.pushOverride = (request) => {
      store.entries.set('a', entry('a', { name: 'Changed meanwhile', updatedAt: '2026-11-03T11:31:00.000Z' }));
      return [{ id: request.entries[0].id, status: 'applied', version: 7, reason: null, current: null }];
    };

    await engine.requestSync();

    expect(store.entries.get('a')).toMatchObject({ name: 'Changed meanwhile', version: 7, dirty: true });
    expect(engine.getSnapshot().waiting).toBe(1);
  });

  it('pushes the dirty profile with the first batch', async () => {
    const { engine, store, server } = await paired();
    store.profile = {
      sex: 'female', birthYear: 1990, heightCm: 170, weightKg: 65, bodyFatPercent: null,
      activityLevel: 'light', goalKgPerWeek: 0, targets: null,
      updatedAt: '2026-11-03T11:00:00.000Z', version: null, dirty: true
    };

    await engine.requestSync();

    expect(server.calls).toContain('push');
    expect(store.profile).toMatchObject({ dirty: false, version: 1 });
  });

  it('goes offline with a reason and never treats unreachability as an error', async () => {
    const { engine, store, server } = await paired();
    store.entries.set('a', entry('a'));
    server.healthError = new NetworkError('timeout');

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'offline', reason: 'timeout' });
    expect(engine.getSnapshot().waiting).toBe(1);
  });

  it('reports a missing local network permission as the offline reason', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const engine = new SyncEngine({
      store,
      deviceKey,
      createApi: () => server.api,
      platform: { ...platform, isLocalNetworkPermissionDenied: async () => true }
    });
    await engine.pair('https://kcal.example.com', '7K2M-QX9D', 'Phone');
    server.healthError = new NetworkError('timeout');

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'offline', reason: 'localNetworkPermission' });
  });

  it('asks to pair again when the server was reset', async () => {
    const { engine, server } = await paired();
    server.serverId = 'another-server';

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'needsPairing', reason: 'serverChanged' });
    expect(server.calls).toEqual(['health']);
  });

  it('asks to pair again when the device was removed', async () => {
    const { engine, server } = await paired();
    server.tokens.clear();
    server.api.challenge = async () => {
      throw new ApiError(401, 'unknown_device', 'Unknown device');
    };

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'needsPairing', reason: 'deviceRemoved' });
  });

  it('pauses sync when an update is required and reports available updates', async () => {
    const { engine, server } = await paired();
    const health = server.api.health;
    server.api.health = async () => ({ ...(await health()), minAppVersion: '0.2.0' });

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'updateRequired' });
    expect(engine.getSnapshot().updateAvailable).toBe(true);
    expect(server.calls).toEqual(['health']);
  });

  it('reuses the access token and re-authenticates once when it is rejected', async () => {
    const { engine, server } = await paired();

    await engine.requestSync();
    expect(server.calls).toEqual(['health', 'pull 0']);

    server.tokens.clear();
    server.calls = [];
    await engine.requestSync();
    expect(server.calls).toEqual(['health', 'pull 0', 'challenge', 'token', 'pull 0']);
  });

  it('reports server errors as error status and keeps the changes', async () => {
    const { engine, store, server } = await paired();
    store.entries.set('a', entry('a'));
    server.api.push = async () => {
      throw new ApiError(500, null, 'HTTP 500');
    };

    await engine.requestSync();

    expect(engine.getSnapshot().status).toEqual({ state: 'error', message: 'HTTP 500' });
    expect(store.state.lastError).toBe('HTTP 500');
    expect(store.entries.get('a')?.dirty).toBe(true);
  });

  it('runs once at a time and coalesces requests during a run into one follow-up run', async () => {
    const { engine, server } = await paired();

    await Promise.all([engine.requestSync(), engine.requestSync(), engine.requestSync()]);

    expect(server.calls.filter((call) => call === 'health')).toHaveLength(2);
  });

  it('forgets the server and the key on disconnect but keeps local data', async () => {
    const { engine, store } = await paired();
    store.entries.set('a', entry('a'));

    await engine.disconnect();

    expect(store.state).toEqual(EMPTY_SYNC_STATE);
    expect(deviceKey.deleteKey).toHaveBeenCalled();
    expect(store.entries.has('a')).toBe(true);
    expect(engine.getSnapshot().status).toEqual({ state: 'disabled' });
  });
});
