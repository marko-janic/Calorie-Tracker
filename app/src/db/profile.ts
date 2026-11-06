/** The local profile (5.5). Saving marks it dirty and schedules a sync. */
import { eq } from 'drizzle-orm';

import { nextUpdatedAt } from '../domain/time';
import type { LocalProfile, ProfileInput } from '../domain/types';
import { notifyLocalChange } from './changes';
import type { Database } from './client';
import { profileFromRow, profileToRow } from './mappers';
import { profile, PROFILE_ID } from './schema';

/** Live query of the profile row (empty until the profile is first saved). */
export function profileQuery(db: Database) {
  return db.select().from(profile).where(eq(profile.id, PROFILE_ID));
}

export function saveProfile(db: Database, input: ProfileInput): void {
  db.transaction((tx) => {
    const current = tx
      .select({ updatedAt: profile.updatedAt, version: profile.version })
      .from(profile)
      .where(eq(profile.id, PROFILE_ID))
      .get();
    const row = profileToRow({
      ...input,
      updatedAt: nextUpdatedAt(current?.updatedAt ?? null),
      version: current?.version ?? null,
      dirty: true
    });
    const { id, ...fields } = row;
    tx.insert(profile).values(row).onConflictDoUpdate({ target: profile.id, set: fields }).run();
  });
  notifyLocalChange();
}

export function getProfile(db: Database): LocalProfile | null {
  const row = profileQuery(db).get();
  return row ? profileFromRow(row) : null;
}
