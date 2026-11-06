import { Entry, DayTotals, NutrientTotal } from './types';

/**
 * Calculate totals for a set of entries.
 * Applies quantity multiplier to each nutrient.
 * Tracks unknown values separately.
 */
export function calculateTotals(entries: Entry[]): DayTotals {
  let kcalSum = 0;
  let proteinSum = 0;
  let proteinUnknown = 0;
  let carbsSum = 0;
  let carbsUnknown = 0;
  let fatSum = 0;
  let fatUnknown = 0;
  let fibreSum = 0;
  let fibreUnknown = 0;

  for (const entry of entries) {
    if (entry.deleted) continue;

    const qty = entry.quantity;

    // kcal is always known
    kcalSum += entry.kcal * qty;

    // Optional nutrients
    if (entry.proteinG !== null) {
      proteinSum += entry.proteinG * qty;
    } else {
      proteinUnknown++;
    }

    if (entry.carbsG !== null) {
      carbsSum += entry.carbsG * qty;
    } else {
      carbsUnknown++;
    }

    if (entry.fatG !== null) {
      fatSum += entry.fatG * qty;
    } else {
      fatUnknown++;
    }

    if (entry.fibreG !== null) {
      fibreSum += entry.fibreG * qty;
    } else {
      fibreUnknown++;
    }
  }

  return {
    kcal: Math.round(kcalSum),
    protein: { value: roundTo1Decimal(proteinSum), unknownCount: proteinUnknown },
    carbs: { value: roundTo1Decimal(carbsSum), unknownCount: carbsUnknown },
    fat: { value: roundTo1Decimal(fatSum), unknownCount: fatUnknown },
    fibre: { value: roundTo1Decimal(fibreSum), unknownCount: fibreUnknown }
  };
}

/**
 * Round to 1 decimal place
 */
export function roundTo1Decimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Format a number for display using device locale, with trailing zeros removed
 */
export function formatNumber(value: number, decimals: number = 1): string {
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
  return formatter.format(value);
}

/**
 * Format kcal value for display
 */
export function formatKcal(value: number): string {
  return formatNumber(Math.round(value), 0);
}

/**
 * Format grams value for display
 */
export function formatGrams(value: number): string {
  return formatNumber(value, 1);
}

/**
 * Parse decimal input, accepting both '.' and ',' as decimal separators
 * and ignoring spaces. Rejects invalid input like trailing junk or multiple separators.
 */
export function parseDecimalInput(text: string): number | null {
  // Remove spaces
  const cleaned = text.replace(/\s/g, '');

  // Replace comma with dot for parsing (only the first occurrence)
  const normalized = cleaned.replace(',', '.');

  // Validate the normalized string format before converting
  // Must be a valid positive decimal number (digits with optional single decimal point)
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  // The regex already guarantees a valid number, so no need for isNaN check
  return parseFloat(normalized);
}

/**
 * Format nutrient total for display, e.g. "18 g · 2 unknown"
 */
export function formatNutrientTotal(total: NutrientTotal): string {
  const value = formatGrams(total.value);
  if (total.unknownCount > 0) {
    return `${value} g · ${total.unknownCount} unknown`;
  }
  return `${value} g`;
}

/**
 * Format the energy of an entry including its quantity, e.g. "660 kcal".
 */
export function formatEntryKcal(entry: Pick<Entry, 'kcal' | 'quantity'>): string {
  return `${formatKcal(entry.kcal * entry.quantity)} kcal`;
}

/**
 * Format the known macronutrients of an entry including its quantity,
 * e.g. "Protein 62 g · Carbs 0 g · Fat 7.2 g". Unknown values are left out.
 */
export function formatMacroLine(entry: Pick<Entry, 'proteinG' | 'carbsG' | 'fatG' | 'fibreG' | 'quantity'>): string {
  const nutrients: [string, number | null][] = [
    ['Protein', entry.proteinG],
    ['Carbs', entry.carbsG],
    ['Fat', entry.fatG],
    ['Fibre', entry.fibreG]
  ];
  return nutrients
    .filter((nutrient): nutrient is [string, number] => nutrient[1] !== null)
    .map(([label, grams]) => `${label} ${formatGrams(roundTo1Decimal(grams * entry.quantity))} g`)
    .join(' · ');
}
