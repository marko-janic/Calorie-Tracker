import {
  bodyFieldsFrom,
  EMPTY_BODY_FIELDS,
  EMPTY_TARGET_FIELDS,
  parseBodyFields,
  parseTargetFields,
  targetFieldsFrom,
  toCalculatorInput
} from './profileForm';

const YEAR = 2026;

describe('parseBodyFields', () => {
  const fields = {
    ...EMPTY_BODY_FIELDS,
    age: '30',
    sex: 'male' as const,
    heightCm: '180',
    weightKg: '80,5',
    activityLevel: 'moderate' as const,
    goalKgPerWeek: -0.5 as const
  };

  it('stores the age as birth year', () => {
    expect(parseBodyFields(fields, YEAR)).toEqual({
      ok: true,
      value: {
        sex: 'male',
        birthYear: 1996,
        heightCm: 180,
        weightKg: 80.5,
        bodyFatPercent: null,
        activityLevel: 'moderate',
        goalKgPerWeek: -0.5
      }
    });
  });

  it('requires sex and activity level', () => {
    const result = parseBodyFields({ ...fields, sex: null, activityLevel: null }, YEAR);
    expect(result).toEqual({ ok: false, errors: { sex: 'Required', activityLevel: 'Required' } });
  });

  it('enforces the limits from section 5.5', () => {
    const result = parseBodyFields({ ...fields, age: '30.5', heightCm: '99', weightKg: '301', bodyFatPercent: '2' }, YEAR);
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual(['age', 'bodyFatPercent', 'heightCm', 'weightKg']);
  });

  it('round-trips through bodyFieldsFrom', () => {
    const result = parseBodyFields({ ...fields, bodyFatPercent: '18' }, YEAR);
    if (!result.ok) throw new Error('expected valid fields');
    expect(bodyFieldsFrom(result.value, YEAR)).toEqual({ ...fields, weightKg: '80.5', bodyFatPercent: '18' });
  });

  it('converts to calculator input', () => {
    const result = parseBodyFields(fields, YEAR);
    if (!result.ok) throw new Error('expected valid fields');
    expect(toCalculatorInput(result.value, YEAR)).toEqual({
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80.5,
      bodyFatPercent: null,
      activityLevel: 'moderate',
      goalKgPerWeek: -0.5
    });
  });
});

describe('parseTargetFields', () => {
  const targets = { kcal: 2210, proteinG: 144, carbsG: 227, fatG: 74, fibreG: 31 };

  it('returns null targets when all fields are empty', () => {
    expect(parseTargetFields(EMPTY_TARGET_FIELDS)).toEqual({ ok: true, value: null });
  });

  it('parses all targets', () => {
    expect(parseTargetFields(targetFieldsFrom(targets))).toEqual({ ok: true, value: targets });
  });

  it('requires every target once one is given', () => {
    const result = parseTargetFields({ ...EMPTY_TARGET_FIELDS, kcal: '2000' });
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual(['carbsG', 'fatG', 'fibreG', 'proteinG']);
  });

  it('enforces the target limits', () => {
    const result = parseTargetFields({ ...targetFieldsFrom(targets), kcal: '10001', fatG: '2001' });
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual(['fatG', 'kcal']);
  });
});
