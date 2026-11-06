/**
 * Pure sync merge rules of the client (6.5): what to push, and how push results and
 * pulled records change the local rows. The engine applies the returned actions.
 */
import { getEatenLocalDate } from '../domain/time';
import type { LocalEntry, LocalProfile } from '../domain/types';
import type {
  EntryChange,
  EntryPushResult,
  EntryRecord,
  ProfileChange,
  ProfilePushResult,
  ProfileRecord
} from './types';

export const PUSH_BATCH_SIZE = 500;

/**
 * A change to a local entry.
 *
 * Actions with `expectedUpdatedAt` are guarded: if the row was edited meanwhile (its updatedAt
 * differs), the store only sets the version and keeps the row dirty (rebase), so the newer local
 * change is pushed on the next run. Pulled records are only applied to rows that are not dirty.
 */
export type EntryAction =
  | { type: 'markSynced'; id: string; version: number | null; expectedUpdatedAt: string }
  | { type: 'rebase'; id: string; version: number | null }
  | { type: 'purge'; id: string; version: number | null; expectedUpdatedAt: string }
  | { type: 'replace'; entry: LocalEntry; expectedUpdatedAt: string }
  | { type: 'upsertPulled'; entry: LocalEntry }
  | { type: 'deletePulled'; id: string };

/** The same for the profile, which is never deleted. */
export type ProfileAction =
  | { type: 'markSynced'; version: number; expectedUpdatedAt: string }
  | { type: 'rebase'; version: number }
  | { type: 'replace'; profile: LocalProfile; expectedUpdatedAt: string }
  | { type: 'upsertPulled'; profile: LocalProfile };

/**
 * Splits the dirty rows: entries created and deleted before ever being synced are purged
 * locally without pushing; everything else is pushed.
 */
export function splitDirtyEntries(dirty: LocalEntry[]): { purge: string[]; push: LocalEntry[] } {
  const purge = dirty.filter((entry) => entry.deleted && entry.version === null).map((entry) => entry.id);
  const push = dirty.filter((entry) => !(entry.deleted && entry.version === null));
  return { purge, push };
}

export function toEntryChange(entry: LocalEntry): EntryChange {
  return {
    id: entry.id,
    baseVersion: entry.version,
    deleted: entry.deleted,
    updatedAt: entry.updatedAt,
    name: entry.name,
    kcal: entry.kcal,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    fibreG: entry.fibreG,
    quantity: entry.quantity,
    mealType: entry.mealType,
    notes: entry.notes,
    eatenAt: entry.eatenAt,
    loggedAt: entry.loggedAt
  };
}

/** A server record as a clean local row. */
export function toLocalEntry(record: EntryRecord): LocalEntry {
  const { version, ...fields } = record;
  return { ...fields, eatenLocalDate: getEatenLocalDate(record.eatenAt), version, dirty: false };
}

/**
 * The action for one push result.
 * @param snapshot the row as it was pushed
 * @param current the row as it is now (undefined if it no longer exists)
 */
export function planEntryPushResult(
  snapshot: LocalEntry,
  current: LocalEntry | undefined,
  result: EntryPushResult
): EntryAction | null {
  if (!current) {
    return null;
  }
  const version = result.current?.version ?? result.version;
  if (current.updatedAt !== snapshot.updatedAt) {
    // Changed during the request: keep it dirty and push it again on top of the server's version
    return { type: 'rebase', id: current.id, version };
  }
  if (result.status === 'rejected' && result.current) {
    return { type: 'replace', entry: toLocalEntry(result.current), expectedUpdatedAt: snapshot.updatedAt };
  }
  if (snapshot.deleted) {
    // A synced tombstone is not needed locally any more
    return { type: 'purge', id: current.id, version, expectedUpdatedAt: snapshot.updatedAt };
  }
  return { type: 'markSynced', id: current.id, version, expectedUpdatedAt: snapshot.updatedAt };
}

/** The action for one pulled record. */
export function planPulledEntry(local: LocalEntry | undefined, record: EntryRecord): EntryAction | null {
  if (local?.dirty) {
    // The local change wins for now; it is pushed on the next run
    return null;
  }
  if (record.deleted) {
    // Deleted records the client never had are ignored
    return local ? { type: 'deletePulled', id: record.id } : null;
  }
  return { type: 'upsertPulled', entry: toLocalEntry(record) };
}

/** Number of skipped deletions to report ("1 deletion skipped – …"). */
export function countDeleteConflicts(results: EntryPushResult[]): number {
  return results.filter((result) => result.status === 'rejected' && result.reason === 'deleteConflict').length;
}

export function toProfileChange(profile: LocalProfile): ProfileChange {
  return {
    baseVersion: profile.version,
    updatedAt: profile.updatedAt,
    sex: profile.sex,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    bodyFatPercent: profile.bodyFatPercent,
    activityLevel: profile.activityLevel,
    goalKgPerWeek: profile.goalKgPerWeek,
    targets: profile.targets
  };
}

export function toLocalProfile(record: ProfileRecord): LocalProfile {
  const { version, ...fields } = record;
  return { ...fields, version, dirty: false };
}

export function planProfilePushResult(
  snapshot: LocalProfile,
  current: LocalProfile | null,
  result: ProfilePushResult
): ProfileAction | null {
  if (!current) {
    return null;
  }
  const version = result.current?.version ?? result.version;
  if (current.updatedAt !== snapshot.updatedAt) {
    return { type: 'rebase', version };
  }
  if (result.status === 'rejected' && result.current) {
    return { type: 'replace', profile: toLocalProfile(result.current), expectedUpdatedAt: snapshot.updatedAt };
  }
  return { type: 'markSynced', version, expectedUpdatedAt: snapshot.updatedAt };
}

export function planPulledProfile(local: LocalProfile | null, record: ProfileRecord): ProfileAction | null {
  return local?.dirty ? null : { type: 'upsertPulled', profile: toLocalProfile(record) };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}
