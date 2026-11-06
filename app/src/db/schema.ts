import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ActivityLevel, MealType, Sex } from '../domain/types';

/** Local diary entries (9.3). Nutrient values are per portion; null means unknown. */
export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g'),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    fibreG: real('fibre_g'),
    quantity: real('quantity').notNull().default(1),
    mealType: text('meal_type').$type<MealType>(), // null = automatic
    notes: text('notes'),
    eatenAt: text('eaten_at').notNull(), // ISO local time with offset
    eatenLocalDate: text('eaten_local_date').notNull(), // YYYY-MM-DD, date part of eatenAt
    loggedAt: text('logged_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
    version: integer('version'), // last server version seen, null = never synced
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true)
  },
  (t) => ({ entriesDay: index('entries_day').on(t.eatenLocalDate) })
);

export const PROFILE_ID = 'profile';

/** The single profile row (5.5), with the targets as columns. */
export const profile = sqliteTable('profile', {
  id: text('id').primaryKey(),
  sex: text('sex').$type<Sex>().notNull(),
  birthYear: integer('birth_year').notNull(),
  heightCm: real('height_cm').notNull(),
  weightKg: real('weight_kg').notNull(),
  bodyFatPercent: real('body_fat_percent'),
  activityLevel: text('activity_level').$type<ActivityLevel>().notNull(),
  goalKgPerWeek: real('goal_kg_per_week').notNull(),
  targetKcal: real('target_kcal'),
  targetProteinG: real('target_protein_g'),
  targetCarbsG: real('target_carbs_g'),
  targetFatG: real('target_fat_g'),
  targetFibreG: real('target_fibre_g'),
  updatedAt: text('updated_at').notNull(),
  version: integer('version'),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true)
});

/** Key/value sync state: serverUrl, serverId, deviceId, deviceName, cursor, lastSyncAt, lastError. */
export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export type EntryRow = typeof entries.$inferSelect;
export type ProfileRow = typeof profile.$inferSelect;
