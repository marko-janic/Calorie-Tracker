import { FormParser, FormResult, numberToField } from './formParser';
import { Per100, scaleNutrients } from './product';
import { addDays } from './time';
import { parseDecimalInput } from './totals';
import { EntryInput, PORTION_SIZE_RANGE, PortionUnit } from './types';

/**
 * Fields of the entry form and of an AI import item. Almost all are text; `portionUnit` is the
 * value of the g/ml toggle. Meal type and eatenAt are handled by the screens.
 */
export interface NutrientFields {
  name: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fibreG: string;
  quantity: string;
  portionSize: string;
  portionUnit: PortionUnit;
  notes: string;
}

export type NutrientField = keyof NutrientFields;

export type NutrientValues = Omit<EntryInput, 'mealType' | 'eatenAt'>;

/** Starting values of the form; kcal may be unknown, e.g. for a scanned product without energy data. */
export type NutrientPrefill = Omit<NutrientValues, 'kcal'> & { kcal: number | null };

export const DEFAULT_PORTION_UNIT: PortionUnit = 'g';

export const EMPTY_NUTRIENT_FIELDS: NutrientFields = {
  name: '',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  fibreG: '',
  quantity: '1',
  portionSize: '',
  portionUnit: DEFAULT_PORTION_UNIT,
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

export function nutrientFieldsFrom(values: NutrientPrefill): NutrientFields {
  return {
    name: values.name,
    kcal: numberToField(values.kcal),
    proteinG: numberToField(values.proteinG),
    carbsG: numberToField(values.carbsG),
    fatG: numberToField(values.fatG),
    fibreG: numberToField(values.fibreG),
    quantity: numberToField(values.quantity),
    portionSize: numberToField(values.portionSize),
    portionUnit: values.portionUnit ?? DEFAULT_PORTION_UNIT,
    notes: values.notes ?? ''
  };
}

const KCAL_RANGE = { min: 0, max: 10000 };
const GRAMS_RANGE = { min: 0, max: 2000 };
const QUANTITY_RANGE = { min: 0.01, max: 100 };

/**
 * Parse and validate the text fields with the limits from section 5.1.
 * An empty portion size means no size and no unit; a size always comes with the selected unit.
 */
export function parseNutrientFields(fields: NutrientFields): FormResult<NutrientValues, NutrientField> {
  const parser = new FormParser<NutrientField>();
  const portionSize = parser.optionalNumber('portionSize', fields.portionSize, PORTION_SIZE_RANGE);
  const values: NutrientValues = {
    name: parser.requiredText('name', fields.name, 200),
    kcal: parser.requiredNumber('kcal', fields.kcal, KCAL_RANGE),
    proteinG: parser.optionalNumber('proteinG', fields.proteinG, GRAMS_RANGE),
    carbsG: parser.optionalNumber('carbsG', fields.carbsG, GRAMS_RANGE),
    fatG: parser.optionalNumber('fatG', fields.fatG, GRAMS_RANGE),
    fibreG: parser.optionalNumber('fibreG', fields.fibreG, GRAMS_RANGE),
    quantity: parser.requiredNumber('quantity', fields.quantity, QUANTITY_RANGE),
    portionSize,
    portionUnit: portionSize === null ? null : parser.choice('portionUnit', PortionUnit.safeParse(fields.portionUnit).data ?? null),
    notes: parser.optionalText('notes', fields.notes, 1000)
  };
  return parser.result(values);
}

type ScaledField = 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fibreG';

/** The nutrient fields that follow the portion size while scaling is on. */
const SCALED_FIELDS: readonly NutrientField[] = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fibreG'] satisfies ScaledField[];

/** Form fields plus whether the nutrients still follow the portion size. */
export interface ScalingFields {
  fields: NutrientFields;
  scaling: boolean;
}

/**
 * Applies one change of the user to the form fields and the scaling rules of a product lookup:
 * - a valid portion size recomputes the nutrients as per-100 value × size ÷ 100 while scaling is on;
 *   an empty or invalid size leaves them as they are;
 * - editing a nutrient by hand switches scaling off for good;
 * - the g/ml toggle is only a label and changes nothing else.
 * Without per-100 values (the plain add and edit screens) nothing is ever scaled.
 */
export function applyFieldChange(
  current: ScalingFields,
  field: NutrientField,
  value: string,
  per100: Per100 | undefined
): ScalingFields {
  const fields = { ...current.fields, [field]: value };
  if (!current.scaling || !per100) {
    return { fields, scaling: false };
  }
  if (SCALED_FIELDS.includes(field)) {
    return { fields, scaling: false };
  }
  const size = field === 'portionSize' ? parseDecimalInput(value) : null;
  if (size === null || size < PORTION_SIZE_RANGE.min || size > PORTION_SIZE_RANGE.max) {
    return { fields, scaling: true };
  }
  return { fields: { ...fields, ...scaledNutrientFields(per100, size) }, scaling: true };
}

/** The nutrient fields for a portion of the given size. */
export function scaledNutrientFields(per100: Per100, size: number): Pick<NutrientFields, ScaledField> {
  const scaled = scaleNutrients(per100, size);
  return {
    kcal: numberToField(scaled.kcal),
    proteinG: numberToField(scaled.proteinG),
    carbsG: numberToField(scaled.carbsG),
    fatG: numberToField(scaled.fatG),
    fibreG: numberToField(scaled.fibreG)
  };
}
