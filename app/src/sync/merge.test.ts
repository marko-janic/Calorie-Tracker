import type { LocalEntry, LocalProfile } from '../domain/types';
import {
  chunk,
  countDeleteConflicts,
  planEntryPushResult,
  planProfilePushResult,
  planPulledEntry,
  planPulledProfile,
  splitDirtyEntries,
  toEntryChange,
  toLocalEntry
} from './merge';
import type { EntryPushResult, EntryRecord, ProfileRecord } from './types';

const localEntry = (overrides: Partial<LocalEntry> = {}): LocalEntry => ({
  id: '0193e7a2-5c1e-7b3a-9d4f-2a1b3c4d5e6f',
  name: 'Oats (80 g)',
  kcal: 300,
  proteinG: 10,
  carbsG: 48,
  fatG: 5.6,
  fibreG: null,
  quantity: 1,
  mealType: null,
  notes: null,
  eatenAt: '2026-11-03T07:30:00+01:00',
  eatenLocalDate: '2026-11-03',
  loggedAt: '2026-11-03T06:30:00.000Z',
  updatedAt: '2026-11-03T06:30:00.000Z',
  deleted: false,
  version: 5,
  dirty: true,
  ...overrides
});

const serverRecord = (overrides: Partial<EntryRecord> = {}): EntryRecord => {
  const { eatenLocalDate: _date, dirty: _dirty, ...fields } = localEntry();
  return { ...fields, version: 6, name: 'Edited elsewhere', updatedAt: '2026-11-03T08:00:00.000Z', ...overrides };
};

const applied = (version: number | null): EntryPushResult => ({
  id: localEntry().id,
  status: 'applied',
  version,
  reason: null,
  current: null
});

const rejected = (reason: 'deleteConflict' | 'olderEdit', current: EntryRecord): EntryPushResult => ({
  id: current.id,
  status: 'rejected',
  version: current.version,
  reason,
  current
});

describe('splitDirtyEntries', () => {
  it('purges entries deleted before they were ever synced', () => {
    const neverSynced = localEntry({ id: 'a', deleted: true, version: null });
    const syncedTombstone = localEntry({ id: 'b', deleted: true, version: 3 });
    const newEntry = localEntry({ id: 'c', version: null });

    const { purge, push } = splitDirtyEntries([neverSynced, syncedTombstone, newEntry]);

    expect(purge).toEqual(['a']);
    expect(push.map((entry) => entry.id)).toEqual(['b', 'c']);
  });
});

describe('toEntryChange', () => {
  it('sends the last seen version as base version and all fields, without local metadata', () => {
    const change = toEntryChange(localEntry({ deleted: true }));

    expect(change.baseVersion).toBe(5);
    expect(change.deleted).toBe(true);
    expect(change.name).toBe('Oats (80 g)');
    expect(change).not.toHaveProperty('dirty');
    expect(change).not.toHaveProperty('eatenLocalDate');
    expect(change).not.toHaveProperty('version');
  });
});

describe('planEntryPushResult', () => {
  it('marks an applied change as synced', () => {
    const entry = localEntry();

    expect(planEntryPushResult(entry, entry, applied(7))).toEqual({
      type: 'markSynced',
      id: entry.id,
      version: 7,
      expectedUpdatedAt: entry.updatedAt
    });
  });

  it('purges a synced tombstone', () => {
    const tombstone = localEntry({ deleted: true });

    expect(planEntryPushResult(tombstone, tombstone, applied(7))).toEqual({
      type: 'purge',
      id: tombstone.id,
      version: 7,
      expectedUpdatedAt: tombstone.updatedAt
    });
  });

  it('replaces the local row with the server record on deleteConflict', () => {
    const tombstone = localEntry({ deleted: true });
    const current = serverRecord();

    const action = planEntryPushResult(tombstone, tombstone, rejected('deleteConflict', current));

    expect(action).toEqual({
      type: 'replace',
      entry: { ...toLocalEntry(current), dirty: false },
      expectedUpdatedAt: tombstone.updatedAt
    });
  });

  it('replaces the local row with the server record on olderEdit', () => {
    const edit = localEntry({ name: 'Old edit' });
    const current = serverRecord();

    const action = planEntryPushResult(edit, edit, rejected('olderEdit', current));

    expect(action).toMatchObject({ type: 'replace', entry: { name: 'Edited elsewhere', version: 6, deleted: false } });
  });

  it('rebases a row that changed during the request, for an applied result', () => {
    const snapshot = localEntry();
    const changed = localEntry({ name: 'Changed meanwhile', updatedAt: '2026-11-03T06:31:00.000Z' });

    expect(planEntryPushResult(snapshot, changed, applied(7))).toEqual({ type: 'rebase', id: snapshot.id, version: 7 });
  });

  it('rebases a row that changed during the request onto the rejected record version', () => {
    const snapshot = localEntry({ deleted: true });
    const changed = localEntry({ updatedAt: '2026-11-03T06:31:00.000Z' });

    expect(planEntryPushResult(snapshot, changed, rejected('deleteConflict', serverRecord({ version: 9 })))).toEqual({
      type: 'rebase',
      id: snapshot.id,
      version: 9
    });
  });

  it('ignores results for rows that no longer exist', () => {
    expect(planEntryPushResult(localEntry(), undefined, applied(7))).toBeNull();
  });
});

describe('planPulledEntry', () => {
  it('skips records whose local row is dirty', () => {
    expect(planPulledEntry(localEntry({ dirty: true }), serverRecord())).toBeNull();
    expect(planPulledEntry(localEntry({ dirty: true }), serverRecord({ deleted: true }))).toBeNull();
  });

  it('upserts records with the server version and dirty = false', () => {
    const action = planPulledEntry(undefined, serverRecord({ eatenAt: '2026-11-02T23:30:00.000-05:00' }));

    expect(action).toEqual({
      type: 'upsertPulled',
      entry: expect.objectContaining({ version: 6, dirty: false, eatenLocalDate: '2026-11-02', name: 'Edited elsewhere' })
    });
  });

  it('overwrites clean local rows', () => {
    expect(planPulledEntry(localEntry({ dirty: false }), serverRecord())).toMatchObject({ type: 'upsertPulled' });
  });

  it('deletes the local row for a pulled tombstone', () => {
    const local = localEntry({ dirty: false });

    expect(planPulledEntry(local, serverRecord({ deleted: true }))).toEqual({ type: 'deletePulled', id: local.id });
  });

  it('ignores tombstones the client never had', () => {
    expect(planPulledEntry(undefined, serverRecord({ deleted: true }))).toBeNull();
  });
});

describe('countDeleteConflicts', () => {
  it('counts only rejected deletes', () => {
    const current = serverRecord();
    expect(countDeleteConflicts([applied(1), rejected('olderEdit', current), rejected('deleteConflict', current)])).toBe(1);
  });
});

const localProfile = (overrides: Partial<LocalProfile> = {}): LocalProfile => ({
  sex: 'male',
  birthYear: 1996,
  heightCm: 180,
  weightKg: 80,
  bodyFatPercent: null,
  activityLevel: 'moderate',
  goalKgPerWeek: -0.5,
  targets: { kcal: 2210, proteinG: 144, carbsG: 227, fatG: 74, fibreG: 31 },
  updatedAt: '2026-11-03T06:30:00.000Z',
  version: 3,
  dirty: true,
  ...overrides
});

const profileRecord = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => {
  const { dirty: _dirty, ...fields } = localProfile();
  return { ...fields, version: 8, weightKg: 79, updatedAt: '2026-11-03T09:00:00.000Z', ...overrides };
};

describe('profile merge rules', () => {
  it('marks an applied profile as synced', () => {
    const profile = localProfile();

    expect(planProfilePushResult(profile, profile, { status: 'applied', version: 9, reason: null, current: null })).toEqual({
      type: 'markSynced',
      version: 9,
      expectedUpdatedAt: profile.updatedAt
    });
  });

  it('takes the server profile when the push was an older edit', () => {
    const profile = localProfile();
    const current = profileRecord();

    expect(planProfilePushResult(profile, profile, { status: 'rejected', version: 8, reason: 'olderEdit', current })).toEqual({
      type: 'replace',
      profile: { ...current, dirty: false },
      expectedUpdatedAt: profile.updatedAt
    });
  });

  it('rebases a profile that changed during the request', () => {
    const snapshot = localProfile();
    const changed = localProfile({ updatedAt: '2026-11-03T06:31:00.000Z' });

    expect(planProfilePushResult(snapshot, changed, { status: 'applied', version: 9, reason: null, current: null })).toEqual({
      type: 'rebase',
      version: 9
    });
  });

  it('skips a pulled profile while the local one is dirty, and applies it otherwise', () => {
    expect(planPulledProfile(localProfile({ dirty: true }), profileRecord())).toBeNull();
    expect(planPulledProfile(localProfile({ dirty: false }), profileRecord())).toEqual({
      type: 'upsertPulled',
      profile: { ...profileRecord(), dirty: false }
    });
    expect(planPulledProfile(null, profileRecord())).toMatchObject({ type: 'upsertPulled' });
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
  });
});
