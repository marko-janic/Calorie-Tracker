import { calculateTotals } from './totals';
import { Entry, MealType } from './types';

/**
 * Infer meal type from local time of eatenAt.
 *
 * Automatic windows (fixed in v1):
 * - 04:00–10:29 → breakfast
 * - 10:30–14:29 → lunch
 * - 14:30–17:29 → snack
 * - 17:30–21:29 → dinner
 * - 21:30–03:59 → snack
 */
export function inferMealType(eatenAt: string): MealType {
  // Parse the ISO 8601 local time to get hour and minute directly from the string
  // This ensures we use the local time in the string, not the device's timezone
  const match = eatenAt.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    throw new Error('Invalid eatenAt format');
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const totalMinutes = hours * 60 + minutes;

  // Define boundaries in minutes from midnight
  const breakfastStart = 4 * 60; // 04:00
  const lunchStart = 10 * 60 + 30; // 10:30
  const snackAfternoonStart = 14 * 60 + 30; // 14:30
  const dinnerStart = 17 * 60 + 30; // 17:30
  const snackEveningStart = 21 * 60 + 30; // 21:30

  if (totalMinutes >= breakfastStart && totalMinutes < lunchStart) {
    return 'breakfast';
  } else if (totalMinutes >= lunchStart && totalMinutes < snackAfternoonStart) {
    return 'lunch';
  } else if (totalMinutes >= snackAfternoonStart && totalMinutes < dinnerStart) {
    return 'snack';
  } else if (totalMinutes >= dinnerStart && totalMinutes < snackEveningStart) {
    return 'dinner';
  } else {
    // 21:30–03:59 → snack
    return 'snack';
  }
}

/**
 * Get computed meal type for an entry.
 * Returns explicit mealType if set, otherwise infers from eatenAt.
 */
export function getComputedMealType(
  mealType: MealType | null,
  eatenAt: string
): MealType {
  return mealType ?? inferMealType(eatenAt);
}

/**
 * Meal types in day view order.
 */
export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Labels of a single meal type, e.g. in the entry form.
 */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack'
};

/**
 * Labels of the meal groups in the day view.
 */
export const MEAL_GROUP_LABELS: Record<MealType, string> = {
  ...MEAL_TYPE_LABELS,
  snack: 'Snacks'
};

export interface MealGroup<T extends Entry> {
  mealType: MealType;
  entries: T[];
  kcal: number;
}

/**
 * Group the entries of a day by their computed meal type.
 * Returns only non-empty groups, in day view order, with entries in chronological order
 * of the local time of eatenAt and a kcal subtotal each. Deleted entries are skipped.
 */
export function groupByMeal<T extends Entry>(entries: T[]): MealGroup<T>[] {
  const sorted = entries
    .filter((entry) => !entry.deleted)
    .sort((a, b) => compareLocalTime(a, b) || a.loggedAt.localeCompare(b.loggedAt));

  return MEAL_TYPES.map((mealType) => {
    const groupEntries = sorted.filter(
      (entry) => getComputedMealType(entry.mealType, entry.eatenAt) === mealType
    );
    return { mealType, entries: groupEntries, kcal: calculateTotals(groupEntries).kcal };
  }).filter((group) => group.entries.length > 0);
}

function compareLocalTime(a: Entry, b: Entry): number {
  return localTimeOfDay(a.eatenAt).localeCompare(localTimeOfDay(b.eatenAt));
}

function localTimeOfDay(eatenAt: string): string {
  // HH:mm:ss, independent of fraction digits and offset
  return eatenAt.substring(11, 19);
}
