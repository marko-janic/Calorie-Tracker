import type { CalculatorInput } from '../calc/calculator';
import { FormParser, FormResult, numberToField } from './formParser';
import { ActivityLevel, GoalKgPerWeek, ProfileInput, Sex, Targets } from './types';

export type BodyValues = Omit<ProfileInput, 'targets'>;

/**
 * Body data fields of the targets screen. The UI asks for the age; the profile stores the birth year (5.5).
 */
export interface BodyFields {
  age: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  bodyFatPercent: string;
  activityLevel: ActivityLevel | null;
  goalKgPerWeek: GoalKgPerWeek;
}

export type BodyField = keyof BodyFields;

export type TargetFields = Record<keyof Targets, string>;

export type TargetField = keyof TargetFields;

export const EMPTY_BODY_FIELDS: BodyFields = {
  age: '',
  sex: null,
  heightCm: '',
  weightKg: '',
  bodyFatPercent: '',
  activityLevel: null,
  goalKgPerWeek: 0
};

export const EMPTY_TARGET_FIELDS: TargetFields = { kcal: '', proteinG: '', carbsG: '', fatG: '', fibreG: '' };

export function bodyFieldsFrom(body: BodyValues, currentYear: number): BodyFields {
  return {
    age: String(currentYear - body.birthYear),
    sex: body.sex,
    heightCm: numberToField(body.heightCm),
    weightKg: numberToField(body.weightKg),
    bodyFatPercent: numberToField(body.bodyFatPercent),
    activityLevel: body.activityLevel,
    goalKgPerWeek: body.goalKgPerWeek
  };
}

export function targetFieldsFrom(targets: Targets | null): TargetFields {
  if (targets === null) {
    return EMPTY_TARGET_FIELDS;
  }
  return {
    kcal: numberToField(targets.kcal),
    proteinG: numberToField(targets.proteinG),
    carbsG: numberToField(targets.carbsG),
    fatG: numberToField(targets.fatG),
    fibreG: numberToField(targets.fibreG)
  };
}

/**
 * Parse and validate the body data with the limits from section 5.5.
 */
export function parseBodyFields(fields: BodyFields, currentYear: number): FormResult<BodyValues, BodyField> {
  const parser = new FormParser<BodyField>();
  const age = parser.requiredNumber('age', fields.age, { min: 1, max: Math.min(120, currentYear - 1900), integer: true });
  const values: BodyValues = {
    sex: parser.choice('sex', fields.sex),
    birthYear: currentYear - age,
    heightCm: parser.requiredNumber('heightCm', fields.heightCm, { min: 100, max: 250 }),
    weightKg: parser.requiredNumber('weightKg', fields.weightKg, { min: 30, max: 300 }),
    bodyFatPercent: parser.optionalNumber('bodyFatPercent', fields.bodyFatPercent, { min: 3, max: 60 }),
    activityLevel: parser.choice('activityLevel', fields.activityLevel),
    goalKgPerWeek: fields.goalKgPerWeek
  };
  return parser.result(values);
}

const TARGET_RANGES: Record<TargetField, { min: number; max: number }> = {
  kcal: { min: 0, max: 10000 },
  proteinG: { min: 0, max: 2000 },
  carbsG: { min: 0, max: 2000 },
  fatG: { min: 0, max: 2000 },
  fibreG: { min: 0, max: 2000 }
};

const TARGET_FIELDS = Object.keys(TARGET_RANGES) as TargetField[];

/**
 * Parse and validate the targets. All fields empty means no targets; otherwise every target is required.
 */
export function parseTargetFields(fields: TargetFields): FormResult<Targets | null, TargetField> {
  const parser = new FormParser<TargetField>();
  if (TARGET_FIELDS.every((field) => fields[field].trim() === '')) {
    return parser.result(null);
  }
  const targets: Targets = {
    kcal: parser.requiredNumber('kcal', fields.kcal, TARGET_RANGES.kcal),
    proteinG: parser.requiredNumber('proteinG', fields.proteinG, TARGET_RANGES.proteinG),
    carbsG: parser.requiredNumber('carbsG', fields.carbsG, TARGET_RANGES.carbsG),
    fatG: parser.requiredNumber('fatG', fields.fatG, TARGET_RANGES.fatG),
    fibreG: parser.requiredNumber('fibreG', fields.fibreG, TARGET_RANGES.fibreG)
  };
  return parser.result(targets);
}

export function toCalculatorInput(body: BodyValues, currentYear: number): CalculatorInput {
  return {
    sex: body.sex,
    age: currentYear - body.birthYear,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    bodyFatPercent: body.bodyFatPercent,
    activityLevel: body.activityLevel,
    goalKgPerWeek: body.goalKgPerWeek
  };
}
