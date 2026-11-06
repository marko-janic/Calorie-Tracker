/**
 * The local persistence the sync engine needs. Implemented with Drizzle in db/syncStore.ts and
 * in memory in the engine tests, so the engine stays framework-free (6.6).
 */
import type { LocalEntry, LocalProfile } from '../domain/types';
import type { EntryAction, ProfileAction } from './merge';

export interface SyncState {
  serverUrl: string | null;
  serverId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  cursor: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export const EMPTY_SYNC_STATE: SyncState = {
  serverUrl: null,
  serverId: null,
  deviceId: null,
  deviceName: null,
  cursor: 0,
  lastSyncAt: null,
  lastError: null
};

export interface SyncStore {
  getSyncState(): Promise<SyncState>;
  updateSyncState(patch: Partial<SyncState>): Promise<void>;
  /** Forgets the server and the pairing (Disconnect, 7.5). Local data is kept. */
  clearSyncState(): Promise<void>;

  getDirtyEntries(): Promise<LocalEntry[]>;
  getEntries(ids: string[]): Promise<LocalEntry[]>;
  /** Deletes local rows that never reached a server. */
  purgeEntries(ids: string[]): Promise<void>;
  /** Applies the actions in one transaction; guarded actions fall back to a rebase (see EntryAction). */
  applyEntryActions(actions: EntryAction[]): Promise<void>;

  getProfile(): Promise<LocalProfile | null>;
  applyProfileAction(action: ProfileAction): Promise<void>;

  /** Dirty entries and profile, i.e. "N waiting". */
  countDirty(): Promise<number>;

  /**
   * Pairing with a different server (6.5): every local entry and the profile become
   * never-synced and dirty, and the cursor goes back to 0, so everything is uploaded again.
   */
  resetForNewServer(): Promise<void>;
}
