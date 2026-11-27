import { z } from 'zod';

import { parseDecimalInput, roundTo1Decimal } from './totals';
import { PORTION_SIZE_RANGE } from './types';
import type { PortionUnit } from './types';

const KJ_PER_KCAL = 4.184;
const DEFAULT_PORTION_SIZE = 100;
const NAME_MAX_LENGTH = 200;

// Every OFF field may be missing, null or of the wrong type. Such a value counts as missing, so one
// bad field does not fail the whole product.
const optionalText = z.string().trim().min(1).optional().catch(undefined);

// OFF sometimes sends numbers as text, e.g. "12.5" or "12,5"
const optionalNumber = z.preprocess((value) => {
  const number = typeof value === 'string' ? parseDecimalInput(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}, z.number().optional());

const NutrimentsSchema = z.object({
  'energy-kcal_100g': optionalNumber,
  energy_100g: optionalNumber, // kJ
  proteins_100g: optionalNumber,
  carbohydrates_100g: optionalNumber,
  fat_100g: optionalNumber,
  fiber_100g: optionalNumber // OFF spells fibre this way
});

/** The fields of an Open Food Facts v3 `product` that the app uses, with OFF's key names. */
export const OffProductSchema = z.object({
  product_name: optionalText,
  brands: optionalText,
  quantity: optionalText,
  product_quantity_unit: optionalText,
  serving_quantity: optionalNumber,
  serving_quantity_unit: optionalText,
  serving_size: optionalText,
  nutriments: NutrimentsSchema.optional().catch(undefined)
});

export type OffProduct = z.infer<typeof OffProductSchema>;

/** Nutrients per 100 g or per 100 ml of a product. Null means OFF has no value. */
export type Per100 = {
  unit: PortionUnit;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fibreG: number | null;
};

export type ScaledNutrients = Omit<Per100, 'unit'>;

export type ProductFormValues = ScaledNutrients & {
  name: string;
  portionSize: number;
  portionUnit: PortionUnit;
};

const UNIT_OF_WORD = new Map<string, PortionUnit>([
  ['g', 'g'],
  ['kg', 'g'],
  ['ml', 'ml'],
  ['cl', 'ml'],
  ['dl', 'ml'],
  ['l', 'ml']
]);

// In text a unit counts only right after a number and not followed by a letter, so "Large" and
// "1 liter" give nothing
const UNIT_AFTER_NUMBER = /\d\s*(kg|g|ml|cl|dl|l)(?![a-z])/i;

function unitOfField(value: string | undefined): PortionUnit | undefined {
  return value === undefined ? undefined : UNIT_OF_WORD.get(value.trim().toLowerCase());
}

function unitInText(text: string | undefined): PortionUnit | undefined {
  const word = text === undefined ? undefined : UNIT_AFTER_NUMBER.exec(text)?.[1];
  return word === undefined ? undefined : UNIT_OF_WORD.get(word.toLowerCase());
}

/**
 * The unit of the per-100 values: the first source that gives a unit, else grams. The product's own
 * unit comes before the serving unit, because OFF sometimes lists the serving of a drink in grams.
 */
export function productUnit(product: OffProduct): PortionUnit {
  return (
    unitOfField(product.product_quantity_unit) ??
    unitInText(product.quantity) ??
    unitOfField(product.serving_quantity_unit) ??
    unitInText(product.serving_size) ??
    'g'
  );
}

function nonNegative(value: number | undefined): number | null {
  return value !== undefined && value >= 0 ? value : null;
}

/** The per-100 values as OFF has them, not rounded. A negative value counts as missing. */
export function productPer100(product: OffProduct): Per100 {
  const nutriments = product.nutriments;
  const kcal = nonNegative(nutriments?.['energy-kcal_100g']);
  const kj = nonNegative(nutriments?.energy_100g);
  return {
    unit: productUnit(product),
    kcal: kcal ?? (kj === null ? null : kj / KJ_PER_KCAL),
    proteinG: nonNegative(nutriments?.proteins_100g),
    carbsG: nonNegative(nutriments?.carbohydrates_100g),
    fatG: nonNegative(nutriments?.fat_100g),
    fibreG: nonNegative(nutriments?.fiber_100g)
  };
}

/** The serving size if OFF has one in the allowed range, else 100. */
export function defaultPortionSize(product: OffProduct): number {
  const size = product.serving_quantity;
  const inRange = size !== undefined && size >= PORTION_SIZE_RANGE.min && size <= PORTION_SIZE_RANGE.max;
  return inRange ? size : DEFAULT_PORTION_SIZE;
}

function tidy(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function cut(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  // Do not leave half of a surrogate pair at the end
  const last = text.charCodeAt(maxLength - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? maxLength - 1 : maxLength;
  return text.slice(0, end).trimEnd();
}

/**
 * The first brand and the product name, e.g. "Ferrero Nutella", cut to the length of an entry name.
 * The brand is left out if the name starts with it. Empty if OFF has neither.
 */
export function productName(product: OffProduct): string {
  const name = tidy(product.product_name);
  // OFF lists brands separated by commas
  const brand = tidy(product.brands?.split(',').find((part) => part.trim() !== ''));
  if (name === '') {
    return cut(brand, NAME_MAX_LENGTH);
  }
  if (brand === '' || name.toLowerCase().startsWith(brand.toLowerCase())) {
    return cut(name, NAME_MAX_LENGTH);
  }
  return cut(`${brand} ${name}`, NAME_MAX_LENGTH);
}

function scale(value: number | null, size: number, round: (value: number) => number): number | null {
  return value === null ? null : round((value * size) / 100);
}

/** Per-100 values × size ÷ 100, kcal rounded to whole numbers and grams to 0.1 (plan §5.4). */
export function scaleNutrients(per100: Per100, size: number): ScaledNutrients {
  return {
    kcal: scale(per100.kcal, size, Math.round),
    proteinG: scale(per100.proteinG, size, roundTo1Decimal),
    carbsG: scale(per100.carbsG, size, roundTo1Decimal),
    fatG: scale(per100.fatG, size, roundTo1Decimal),
    fibreG: scale(per100.fibreG, size, roundTo1Decimal)
  };
}

/** The form values of a product at a portion size, which is its serving size unless given. */
export function productToFormValues(product: OffProduct, size: number = defaultPortionSize(product)): ProductFormValues {
  const per100 = productPer100(product);
  return {
    name: productName(product),
    portionSize: size,
    portionUnit: per100.unit,
    ...scaleNutrients(per100, size)
  };
}

/** Whether OFF has anything to prefill: a name or at least one nutrient value. */
export function hasProductData(product: OffProduct): boolean {
  const { kcal, proteinG, carbsG, fatG, fibreG } = productPer100(product);
  return productName(product) !== '' || [kcal, proteinG, carbsG, fatG, fibreG].some((value) => value !== null);
}
