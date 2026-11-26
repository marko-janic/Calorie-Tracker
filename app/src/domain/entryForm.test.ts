import {
  applyFieldChange,
  EMPTY_NUTRIENT_FIELDS,
  latestEatenDate,
  NutrientField,
  NutrientFields,
  nutrientFieldsFrom,
  parseNutrientFields,
  ScalingFields,
  scaledNutrientFields
} from './entryForm';
import type { Per100 } from './product';

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
        portionSize: null,
        portionUnit: null,
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

  describe('portion size and unit', () => {
    const portion = (portionSize: string, portionUnit: string): NutrientFields =>
      ({ ...fields, portionSize, portionUnit }) as NutrientFields;
    const parsed = (input: NutrientFields) => {
      const result = parseNutrientFields(input);
      return result.ok ? { portionSize: result.value.portionSize, portionUnit: result.value.portionUnit } : result.errors;
    };

    it('gives both null for an empty size, whatever the unit toggle says', () => {
      expect(parsed(portion('', 'g'))).toEqual({ portionSize: null, portionUnit: null });
      expect(parsed(portion('  ', 'ml'))).toEqual({ portionSize: null, portionUnit: null });
    });

    it('gives both set for a size, with the selected unit', () => {
      expect(parsed(portion('330', 'ml'))).toEqual({ portionSize: 330, portionUnit: 'ml' });
      expect(parsed(portion('37,5', 'g'))).toEqual({ portionSize: 37.5, portionUnit: 'g' });
    });

    it('requires a valid unit for a size', () => {
      expect(parsed(portion('150', ''))).toEqual({ portionUnit: 'Required' });
      expect(parsed(portion('150', 'cup'))).toEqual({ portionUnit: 'Required' });
    });

    it('accepts sizes from 0.1 to 10000 and rejects the rest', () => {
      expect(parsed(portion('0.1', 'g'))).toEqual({ portionSize: 0.1, portionUnit: 'g' });
      expect(parsed(portion('10000', 'g'))).toEqual({ portionSize: 10000, portionUnit: 'g' });
      for (const size of ['0.09', '0', '10000.1', '1.2.3', 'abc']) {
        expect(parsed(portion(size, 'g'))).toEqual({ portionSize: 'Enter a number from 0.1 to 10000' });
      }
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
      portionSize: 150,
      portionUnit: 'g' as const,
      notes: null
    };
    expect(parseNutrientFields(nutrientFieldsFrom(values))).toEqual({ ok: true, value: values });
  });

  it('shows no size and the default unit for an entry without a portion size', () => {
    const fields = nutrientFieldsFrom({
      name: 'Rice',
      kcal: 195,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fibreG: null,
      quantity: 1,
      portionSize: null,
      portionUnit: null,
      notes: null
    });
    expect(fields).toMatchObject({ portionSize: '', portionUnit: 'g' });
  });

  it('keeps the unit of an entry in millilitres', () => {
    const fields = nutrientFieldsFrom({
      name: 'Cola',
      kcal: 139,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fibreG: null,
      quantity: 1,
      portionSize: 330,
      portionUnit: 'ml',
      notes: null
    });
    expect(fields).toMatchObject({ portionSize: '330', portionUnit: 'ml' });
  });

  it('leaves an unknown kcal empty (a scanned product without energy data)', () => {
    const fields = nutrientFieldsFrom({
      name: 'Mystery bar',
      kcal: null,
      proteinG: 5,
      carbsG: null,
      fatG: null,
      fibreG: null,
      quantity: 1,
      portionSize: 100,
      portionUnit: 'g',
      notes: null
    });
    expect(fields).toMatchObject({ kcal: '', proteinG: '5' });
  });
});

describe('applyFieldChange', () => {
  // A drink: per 100 ml, with fat and fibre unknown
  const per100: Per100 = { unit: 'ml', kcal: 42.1212, proteinG: 0, carbsG: 10.6, fatG: null, fibreG: null };
  const start: ScalingFields = {
    fields: { ...EMPTY_NUTRIENT_FIELDS, name: 'Cola', kcal: '42', proteinG: '0', carbsG: '10.6', portionSize: '100', portionUnit: 'ml' },
    scaling: true
  };
  const change = (state: ScalingFields, field: NutrientField, value: string) => applyFieldChange(state, field, value, per100);

  it('rescales the nutrients when the portion size changes', () => {
    const result = change(start, 'portionSize', '330');

    expect(result.scaling).toBe(true);
    expect(result.fields).toMatchObject({
      portionSize: '330',
      kcal: '139',
      proteinG: '0',
      carbsG: '35',
      fatG: '',
      fibreG: ''
    });
  });

  it('accepts a decimal comma in the size', () => {
    expect(change(start, 'portionSize', '37,5').fields).toMatchObject({ kcal: '16', carbsG: '4' });
  });

  it.each(['', '  ', 'abc', '1.2.3', '0', '0.09', '10000.1'])('leaves the nutrients as they are for the size "%s"', (size) => {
    const result = change(start, 'portionSize', size);

    expect(result.scaling).toBe(true);
    expect(result.fields).toEqual({ ...start.fields, portionSize: size });
  });

  it('continues scaling once a valid size follows an empty one', () => {
    const cleared = change(start, 'portionSize', '');
    const typed = change(cleared, 'portionSize', '200');

    expect(typed.fields).toMatchObject({ kcal: '84', carbsG: '21.2' });
  });

  it.each(['kcal', 'proteinG', 'carbsG', 'fatG', 'fibreG'] as const)('stops scaling for good when %s is edited by hand', (field) => {
    const edited = change(start, field, '7');
    const resized = change(edited, 'portionSize', '330');

    expect(edited.scaling).toBe(false);
    expect(edited.fields[field]).toBe('7');
    expect(resized.scaling).toBe(false);
    expect(resized.fields).toEqual({ ...edited.fields, portionSize: '330' });
  });

  it('keeps scaling when the name, quantity, notes or unit change', () => {
    let state = start;
    state = change(state, 'name', 'Cola Zero');
    state = change(state, 'quantity', '2');
    state = change(state, 'notes', 'with ice');
    state = change(state, 'portionUnit', 'g');

    expect(state.scaling).toBe(true);
    expect(state.fields).toEqual({ ...start.fields, name: 'Cola Zero', quantity: '2', notes: 'with ice', portionUnit: 'g' });
    // The unit is only a label: the same size gives the same nutrients in g and in ml
    expect(change(state, 'portionSize', '330').fields).toMatchObject({ kcal: '139', portionUnit: 'g' });
  });

  it('never scales without per-100 values', () => {
    const plain: ScalingFields = { fields: start.fields, scaling: false };

    const result = applyFieldChange(plain, 'portionSize', '330', undefined);

    expect(result).toEqual({ fields: { ...start.fields, portionSize: '330' }, scaling: false });
    expect(applyFieldChange(start, 'portionSize', '330', undefined).scaling).toBe(false);
  });
});

describe('scaledNutrientFields', () => {
  it('writes the scaled nutrients as field text, empty for unknown values', () => {
    const per100: Per100 = { unit: 'g', kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, fibreG: null };

    expect(scaledNutrientFields(per100, 15)).toEqual({ kcal: '81', proteinG: '0.9', carbsG: '8.6', fatG: '4.6', fibreG: '' });
  });
});

describe('latestEatenDate', () => {
  it('is tomorrow', () => {
    expect(latestEatenDate('2026-12-31')).toBe('2027-01-01');
  });
});
