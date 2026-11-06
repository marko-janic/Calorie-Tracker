/** Conversion between Drizzle rows and the domain types. */
import type { LocalEntry, LocalProfile, Targets } from '../domain/types';
import type { EntryRow, ProfileRow } from './schema';
import { PROFILE_ID } from './schema';

export function entryFromRow(row: EntryRow): LocalEntry {
  return row;
}

export function profileFromRow(row: ProfileRow): LocalProfile {
  const { targetKcal, targetProteinG, targetCarbsG, targetFatG, targetFibreG } = row;
  const targets: Targets | null =
    targetKcal !== null && targetProteinG !== null && targetCarbsG !== null && targetFatG !== null && targetFibreG !== null
      ? { kcal: targetKcal, proteinG: targetProteinG, carbsG: targetCarbsG, fatG: targetFatG, fibreG: targetFibreG }
      : null;
  return {
    sex: row.sex,
    birthYear: row.birthYear,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    bodyFatPercent: row.bodyFatPercent,
    activityLevel: row.activityLevel,
    goalKgPerWeek: row.goalKgPerWeek as LocalProfile['goalKgPerWeek'],
    targets,
    updatedAt: row.updatedAt,
    version: row.version,
    dirty: row.dirty
  };
}

export function profileToRow(profile: LocalProfile): ProfileRow {
  return {
    id: PROFILE_ID,
    sex: profile.sex,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    bodyFatPercent: profile.bodyFatPercent,
    activityLevel: profile.activityLevel,
    goalKgPerWeek: profile.goalKgPerWeek,
    targetKcal: profile.targets?.kcal ?? null,
    targetProteinG: profile.targets?.proteinG ?? null,
    targetCarbsG: profile.targets?.carbsG ?? null,
    targetFatG: profile.targets?.fatG ?? null,
    targetFibreG: profile.targets?.fibreG ?? null,
    updatedAt: profile.updatedAt,
    version: profile.version,
    dirty: profile.dirty
  };
}
