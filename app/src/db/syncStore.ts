/**
 * The sync engine's persistence (sync/store.ts) on the local Drizzle database.
 * The expo-sqlite driver is synchronous; transactions must use synchronous callbacks
 * (.run(), .all(), .get()), so every statement of a transaction runs before its commit.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { LocalEntry } from '../domain/types';
import type { EntryAction, ProfileAction } from '../sync/merge';
import { EMPTY_SYNC_STATE, SyncState, SyncStore } from '../sync/store';
import type { Database } from './client';
import { entryFromRow, profileFromRow, profileToRow } from './mappers';
import { entries, profile, PROFILE_ID, syncState } from './schema';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;

const SYNC_STATE_KEYS = Object.keys(EMPTY_SYNC_STATE) as (keyof SyncState)[];

/** Live query of the sync state rows; convert them with syncStateFromRows. */
export function syncStateQuery(db: Database) {
  return db.select().from(syncState);
}

export function syncStateFromRows(rows: { key: string; value: string }[]): SyncState {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    serverUrl: values.get('serverUrl') ?? null,
    serverId: values.get('serverId') ?? null,
    deviceId: values.get('deviceId') ?? null,
    deviceName: values.get('deviceName') ?? null,
    cursor: Number(values.get('cursor') ?? 0),
    lastSyncAt: values.get('lastSyncAt') ?? null,
    lastError: values.get('lastError') ?? null
  };
}

export function createSyncStore(db: Database): SyncStore {
  return {
    async getSyncState() {
      return syncStateFromRows(syncStateQuery(db).all());
    },

    async updateSyncState(patch) {
      db.transaction((tx) => {
        for (const key of SYNC_STATE_KEYS) {
          if (!(key in patch)) {
            continue;
          }
          const value = patch[key];
          if (value === null || value === undefined) {
            tx.delete(syncState).where(eq(syncState.key, key)).run();
          } else {
            tx.insert(syncState)
              .values({ key, value: String(value) })
              .onConflictDoUpdate({ target: syncState.key, set: { value: String(value) } })
              .run();
          }
        }
      });
    },

    async clearSyncState() {
      db.delete(syncState).run();
    },

    async getDirtyEntries() {
      return db.select().from(entries).where(eq(entries.dirty, true)).all().map(entryFromRow);
    },

    async getEntries(ids) {
      if (ids.length === 0) {
        return [];
      }
      return db.select().from(entries).where(inArray(entries.id, ids)).all().map(entryFromRow);
    },

    async purgeEntries(ids) {
      if (ids.length > 0) {
        db.delete(entries).where(and(inArray(entries.id, ids), eq(entries.dirty, true))).run();
      }
    },

    async applyEntryActions(actions) {
      if (actions.length === 0) {
        return;
      }
      db.transaction((tx) => {
        for (const action of actions) {
          applyEntryAction(tx, action);
        }
      });
    },

    async getProfile() {
      const row = db.select().from(profile).where(eq(profile.id, PROFILE_ID)).get();
      return row ? profileFromRow(row) : null;
    },

    async applyProfileAction(action) {
      db.transaction((tx) => applyProfileAction(tx, action));
    },

    async countDirty() {
      const entryCount = db.select({ count: sql<number>`count(*)` }).from(entries).where(eq(entries.dirty, true)).get();
      const profileCount = db.select({ count: sql<number>`count(*)` }).from(profile).where(eq(profile.dirty, true)).get();
      return Number(entryCount?.count ?? 0) + Number(profileCount?.count ?? 0);
    },

    async resetForNewServer() {
      db.transaction((tx) => {
        tx.update(entries).set({ version: null, dirty: true }).run();
        tx.update(profile).set({ version: null, dirty: true }).run();
        tx.delete(syncState).where(eq(syncState.key, 'cursor')).run();
      });
    }
  };
}

function applyEntryAction(db: Executor, action: EntryAction): void {
  switch (action.type) {
    case 'markSynced': {
      const updated = db
        .update(entries)
        .set({ version: action.version, dirty: false })
        .where(and(eq(entries.id, action.id), eq(entries.updatedAt, action.expectedUpdatedAt)))
        .returning({ id: entries.id })
        .all();
      if (updated.length === 0) {
        rebaseEntry(db, action.id, action.version);
      }
      return;
    }
    case 'rebase':
      rebaseEntry(db, action.id, action.version);
      return;
    case 'purge': {
      const deleted = db
        .delete(entries)
        .where(and(eq(entries.id, action.id), eq(entries.updatedAt, action.expectedUpdatedAt)))
        .returning({ id: entries.id })
        .all();
      if (deleted.length === 0) {
        rebaseEntry(db, action.id, action.version);
      }
      return;
    }
    case 'replace': {
      const { id, ...fields } = action.entry;
      const updated = db
        .update(entries)
        .set(fields)
        .where(and(eq(entries.id, id), eq(entries.updatedAt, action.expectedUpdatedAt)))
        .returning({ id: entries.id })
        .all();
      if (updated.length === 0) {
        rebaseEntry(db, id, action.entry.version);
      }
      return;
    }
    case 'upsertPulled':
      upsertCleanEntry(db, action.entry);
      return;
    case 'deletePulled':
      db.delete(entries).where(and(eq(entries.id, action.id), eq(entries.dirty, false))).run();
      return;
  }
}

/** The row changed while its push was in flight: take the server's version but stay dirty. */
function rebaseEntry(db: Executor, id: string, version: number | null): void {
  db.update(entries).set({ version }).where(eq(entries.id, id)).run();
}

/** Inserts or overwrites a row with a server record, unless the local row has unpushed changes. */
function upsertCleanEntry(db: Executor, entry: LocalEntry): void {
  const { id, ...fields } = entry;
  db.insert(entries)
    .values(entry)
    .onConflictDoUpdate({ target: entries.id, set: fields, where: eq(entries.dirty, false) })
    .run();
}

function applyProfileAction(db: Executor, action: ProfileAction): void {
  switch (action.type) {
    case 'markSynced': {
      const updated = db
        .update(profile)
        .set({ version: action.version, dirty: false })
        .where(and(eq(profile.id, PROFILE_ID), eq(profile.updatedAt, action.expectedUpdatedAt)))
        .returning({ id: profile.id })
        .all();
      if (updated.length === 0) {
        db.update(profile).set({ version: action.version }).where(eq(profile.id, PROFILE_ID)).run();
      }
      return;
    }
    case 'rebase':
      db.update(profile).set({ version: action.version }).where(eq(profile.id, PROFILE_ID)).run();
      return;
    case 'replace': {
      const { id, ...fields } = profileToRow(action.profile);
      const updated = db
        .update(profile)
        .set(fields)
        .where(and(eq(profile.id, id), eq(profile.updatedAt, action.expectedUpdatedAt)))
        .returning({ id: profile.id })
        .all();
      if (updated.length === 0) {
        db.update(profile).set({ version: action.profile.version }).where(eq(profile.id, PROFILE_ID)).run();
      }
      return;
    }
    case 'upsertPulled': {
      const row = profileToRow(action.profile);
      const { id, ...fields } = row;
      db.insert(profile)
        .values(row)
        .onConflictDoUpdate({ target: profile.id, set: fields, where: eq(profile.dirty, false) })
        .run();
      return;
    }
  }
}
