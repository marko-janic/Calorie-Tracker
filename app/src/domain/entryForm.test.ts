import { EMPTY_NUTRIENT_FIELDS, latestEatenDate, nutrientFieldsFrom, parseNutrientFields } from './entryForm';

describe('parseNutrientFields', () => {
  const fields = { ...EMPTY_NUTRIENT_FIELDS, name: '  Oats (80 g) ', kcal: '300' };

  it('parses required and optional fields', () => {
    expect(parseNutrientFields({ ...fields, proteinG: '10,5', fatG: ' 1 2 ', quantity: '1.5', notes: ' ok ' })).toEqual({
      ok: true,
      value: {
        name: 'Oats (80 g)',
        kcal: 300,
        proteinG: 10.5,
        carbsG: null,
        fatG: 12,
        fibreG: null,
        quantity: 1.5,
        notes: 'ok'
      }
    });
  });

  it('treats empty optional fields as unknown, not zero', () => {
    const result = parseNutrientFields(fields);
    expect(result.ok && result.value.proteinG).toBeNull();
    expect(result.ok && result.value.notes).toBeNull();
  });

  it('requires a name and kcal', () => {
    expect(parseNutrientFields({ ...fields, name: '  ', kcal: '' })).toEqual({
      ok: false,
      errors: { name: 'Required', kcal: 'Enter a number from 0 to 10000' }
    });
  });

  it('enforces the limits from section 5.1', () => {
    const result = parseNutrientFields({
      ...fields,
      name: 'x'.repeat(201),
      kcal: '10001',
      carbsG: '2000.1',
      quantity: '0',
      notes: 'x'.repeat(1001)
    });
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual(['carbsG', 'kcal', 'name', 'notes', 'quantity']);
  });

  it('rejects malformed numbers', () => {
    expect(parseNutrientFields({ ...fields, fibreG: '1.2.3' })).toEqual({
      ok: false,
      errors: { fibreG: 'Enter a number from 0 to 2000' }
    });
  });
});

describe('nutrientFieldsFrom', () => {
  it('round-trips through parseNutrientFields', () => {
    const values = {
      name: 'Rice',
      kcal: 195,
      proteinG: 4.1,
      carbsG: 42,
      fatG: null,
      fibreG: 0.6,
      quantity: 2,
      notes: null
    };
    expect(parseNutrientFields(nutrientFieldsFrom(values))).toEqual({ ok: true, value: values });
  });
});

describe('latestEatenDate', () => {
  it('is tomorrow', () => {
    expect(latestEatenDate('2026-12-31')).toBe('2027-01-01');
  });
});
