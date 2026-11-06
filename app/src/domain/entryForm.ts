import { FormParser, FormResult, numberToField } from './formParser';
import { addDays } from './time';
import { EntryInput } from './types';

/**
 * Text fields of the entry form and of an AI import item.
 * Meal type and eatenAt are not text fields and are handled by the screens.
 */
export interface NutrientFields {
  name: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fibreG: string;
  quantity: string;
  notes: string;
}

export type NutrientField = keyof NutrientFields;

export type NutrientValues = Omit<EntryInput, 'mealType' | 'eatenAt'>;

export const EMPTY_NUTRIENT_FIELDS: NutrientFields = {
  name: '',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  fibreG: '',
  quantity: '1',
  notes: ''
};

/** The earliest local date an entry may be eaten on (server validation, 7.6). */
export const EARLIEST_EATEN_DATE = '2000-01-01';

/**
 * The latest local date an entry may be eaten on.
 * The server accepts eatenAt up to now + 2 days, so any time of tomorrow is always valid.
 */
export function latestEatenDate(today: string): string {
  return addDays(today, 1);
}

export function nutrientFieldsFrom(values: NutrientValues): NutrientFields {
  return {
    name: values.name,
    kcal: numberToField(values.kcal),
    proteinG: numberToField(values.proteinG),
    carbsG: numberToField(values.carbsG),
    fatG: numberToField(values.fatG),
    fibreG: numberToField(values.fibreG),
    quantity: numberToField(values.quantity),
    notes: values.notes ?? ''
  };
}

const KCAL_RANGE = { min: 0, max: 10000 };
const GRAMS_RANGE = { min: 0, max: 2000 };
const QUANTITY_RANGE = { min: 0.01, max: 100 };

/**
 * Parse and validate the text fields with the limits from section 5.1.
 */
export function parseNutrientFields(fields: NutrientFields): FormResult<NutrientValues, NutrientField> {
  const parser = new FormParser<NutrientField>();
  const values: NutrientValues = {
    name: parser.requiredText('name', fields.name, 200),
    kcal: parser.requiredNumber('kcal', fields.kcal, KCAL_RANGE),
    proteinG: parser.optionalNumber('proteinG', fields.proteinG, GRAMS_RANGE),
    carbsG: parser.optionalNumber('carbsG', fields.carbsG, GRAMS_RANGE),
    fatG: parser.optionalNumber('fatG', fields.fatG, GRAMS_RANGE),
    fibreG: parser.optionalNumber('fibreG', fields.fibreG, GRAMS_RANGE),
    quantity: parser.requiredNumber('quantity', fields.quantity, QUANTITY_RANGE),
    notes: parser.optionalText('notes', fields.notes, 1000)
  };
  return parser.result(values);
}
