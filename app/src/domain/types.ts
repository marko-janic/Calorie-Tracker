import { z } from 'zod';

// Meal type enum
export const MealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MealType = z.infer<typeof MealType>;

// Activity level enum
export const ActivityLevel = z.enum(['sedentary', 'light', 'moderate', 'active', 'veryActive']);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ActivityLevel = z.infer<typeof ActivityLevel>;

// Sex enum
export const Sex = z.enum(['male', 'female']);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type Sex = z.infer<typeof Sex>;

// UTC timestamp (loggedAt, updatedAt): exactly YYYY-MM-DDTHH:mm:ss.sssZ, as the server writes it
export const UtcTimestampSchema = z.iso.datetime({ precision: 3 });

// Local timestamp (eatenAt): ISO 8601 with an explicit +hh:mm/-hh:mm offset or Z and 0–3 fraction digits
export const LocalTimestampSchema = z.iso
  .datetime({ offset: true })
  .regex(/:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/, { message: 'At most 3 fraction digits are allowed' });

// Entry fields shared by local and server records
export const EntryFieldsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(2000).nullable(),
  carbsG: z.number().min(0).max(2000).nullable(),
  fatG: z.number().min(0).max(2000).nullable(),
  fibreG: z.number().min(0).max(2000).nullable(),
  quantity: z.number().min(0.01).max(100),
  mealType: MealType.nullable(), // null means automatic
  notes: z.string().max(1000).nullable(),
  eatenAt: LocalTimestampSchema, // ISO 8601 local time with offset
  loggedAt: UtcTimestampSchema, // UTC ISO 8601 with milliseconds
  updatedAt: UtcTimestampSchema, // UTC ISO 8601 with milliseconds
  deleted: z.boolean()
});

// Entry schema
export const EntrySchema = EntryFieldsSchema.extend({
  eatenLocalDate: z.string().date() // YYYY-MM-DD
}).refine(
  (data) => data.eatenLocalDate === data.eatenAt.slice(0, 10),
  { message: 'eatenLocalDate must match the date part of eatenAt' }
);

export type Entry = z.infer<typeof EntrySchema>;

// Profile targets
export const TargetsSchema = z.object({
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(2000),
  carbsG: z.number().min(0).max(2000),
  fatG: z.number().min(0).max(2000),
  fibreG: z.number().min(0).max(2000)
});

export type Targets = z.infer<typeof TargetsSchema>;

// Profile schema
export const ProfileSchema = z.object({
  sex: Sex,
  birthYear: z.number().int().min(1900).max(2100).refine(
    (year) => year <= new Date().getFullYear(),
    { message: 'Birth year cannot be in the future' }
  ),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  bodyFatPercent: z.number().min(3).max(60).nullable(),
  activityLevel: ActivityLevel,
  goalKgPerWeek: z.union([
    z.literal(-0.5),
    z.literal(-0.25),
    z.literal(0),
    z.literal(0.25)
  ]),
  targets: TargetsSchema.nullable(),
  updatedAt: UtcTimestampSchema // UTC ISO 8601 with milliseconds
});

export type Profile = z.infer<typeof ProfileSchema>;

export type GoalKgPerWeek = Profile['goalKgPerWeek'];

// The user-editable part of an entry (entry form, AI import)
export type EntryInput = Pick<
  Entry,
  'name' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fibreG' | 'quantity' | 'mealType' | 'notes' | 'eatenAt'
>;

// The user-editable part of the profile (targets screen)
export type ProfileInput = Omit<Profile, 'updatedAt'>;

// Sync metadata kept with every local record (section 6.1)
export interface SyncMeta {
  version: number | null; // last server version seen, null = never synced
  dirty: boolean; // local changes that are not pushed yet
}

export type LocalEntry = Entry & SyncMeta;

export type LocalProfile = Profile & SyncMeta;

// Nutrient totals
export interface NutrientTotal {
  value: number;
  unknownCount: number;
}

export interface DayTotals {
  kcal: number;
  protein: NutrientTotal;
  carbs: NutrientTotal;
  fat: NutrientTotal;
  fibre: NutrientTotal;
}

// Entry with computed meal type
export interface EntryWithMealType extends Entry {
  computedMealType: MealType;
}
