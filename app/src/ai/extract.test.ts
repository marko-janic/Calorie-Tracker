import { extractAIImport } from './extract';

const validItem = {
  name: 'Chicken breast (200g)',
  kcal: 330,
  protein_g: 62,
  carbs_g: 0,
  fat_g: 7.2,
  fibre_g: 0
};

describe('extractAIImport', () => {
  it('extracts from fenced code block', () => {
    const text = '```json\n{"schemaVersion":1,"items":[' + JSON.stringify(validItem) + ']}\n```';
    const result = extractAIImport(text);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Chicken breast (200g)');
    }
  });

  it('extracts from text with surrounding content', () => {
    const json = '{"schemaVersion":1,"items":[' + JSON.stringify(validItem) + ']}';
    const text = 'Here is your result:\n' + json + '\nHope this helps!';
    const result = extractAIImport(text);

    expect(result.success).toBe(true);
  });

  it('handles bare array as items', () => {
    const text = '[' + JSON.stringify(validItem) + ']';
    const result = extractAIImport(text);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.items).toHaveLength(1);
    }
  });

  it('fails on invalid JSON', () => {
    const text = '{invalid json}';
    const result = extractAIImport(text);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Couldn't find valid JSON");
    }
  });

  it('fails on missing required fields', () => {
    const text = '{"schemaVersion":1,"items":[{"kcal":100}]}'; // missing name
    const result = extractAIImport(text);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Validation failed');
      expect(result.details).toBeDefined();
    }
  });

  it('fails on out-of-range values', () => {
    const item = { ...validItem, kcal: 15000 }; // exceeds max
    const text = '{"schemaVersion":1,"items":[' + JSON.stringify(item) + ']}';
    const result = extractAIImport(text);

    expect(result.success).toBe(false);
  });

  it('detects extra keys', () => {
    const item = { ...validItem, extraField: 'value' };
    const text = '{"schemaVersion":1,"items":[' + JSON.stringify(item) + ']}';
    const result = extractAIImport(text);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.hadExtraKeys).toBe(true);
    }
  });

  it('handles null values correctly', () => {
    const item = {
      name: 'Test',
      kcal: 100,
      protein_g: null,
      carbs_g: null
    };
    const text = '{"schemaVersion":1,"items":[' + JSON.stringify(item) + ']}';
    const result = extractAIImport(text);

    expect(result.success).toBe(true);
  });

  it('handles missing optional fields', () => {
    const item = {
      name: 'Test',
      kcal: 100
      // all nutrients omitted
    };
    const text = '{"schemaVersion":1,"items":[' + JSON.stringify(item) + ']}';
    const result = extractAIImport(text);

    expect(result.success).toBe(true);
  });

  it('formats validation errors with item numbers', () => {
    const items = [
      validItem,
      { name: '', kcal: 100 }, // invalid name
      validItem
    ];
    const text = '{"schemaVersion":1,"items":' + JSON.stringify(items) + '}';
    const result = extractAIImport(text);

    expect(result.success).toBe(false);
    if (!result.success && result.details) {
      expect(result.details[0]).toContain('Item 2');
    }
  });

  describe('portion size and unit', () => {
    const extract = (...items: object[]) => extractAIImport(JSON.stringify({ schemaVersion: 1, items }));

    it('accepts both fields and passes them on', () => {
      const result = extract({ ...validItem, portionSize: 200, portionUnit: 'g' }, { name: 'Cola', kcal: 139, portionSize: 330, portionUnit: 'ml' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.items.map((item) => [item.portionSize, item.portionUnit])).toEqual([[200, 'g'], [330, 'ml']]);
        expect(result.hadExtraKeys).toBe(false);
      }
    });

    it('accepts both null and both missing', () => {
      expect(extract({ ...validItem, portionSize: null, portionUnit: null }).success).toBe(true);
      expect(extract(validItem).success).toBe(true);
    });

    it('fails for a size without a unit and names the item and the field', () => {
      const result = extract(validItem, { ...validItem, portionSize: 150 });

      expect(result).toEqual({
        success: false,
        error: 'Validation failed',
        details: ['Item 2, portionUnit: portionUnit is required when portionSize is given']
      });
    });

    it('fails for a unit without a size and names the item and the field', () => {
      const result = extract({ ...validItem, portionUnit: 'ml' }, validItem);

      expect(result).toEqual({
        success: false,
        error: 'Validation failed',
        details: ['Item 1, portionSize: portionSize is required when portionUnit is given']
      });
    });

    it('treats a null on one side like a missing value', () => {
      expect(extract({ ...validItem, portionSize: 150, portionUnit: null }).success).toBe(false);
      expect(extract({ ...validItem, portionSize: null, portionUnit: 'g' }).success).toBe(false);
    });

    it.each([
      ['an unknown unit', { portionSize: 1, portionUnit: 'cup' }],
      ['an uppercase unit', { portionSize: 100, portionUnit: 'G' }],
      ['a size below 0.1', { portionSize: 0.09, portionUnit: 'g' }],
      ['a size above 10000', { portionSize: 10001, portionUnit: 'g' }],
      ['a size given as text', { portionSize: '150', portionUnit: 'g' }]
    ])('fails for %s', (_, portion) => {
      expect(extract({ ...validItem, ...portion }).success).toBe(false);
    });

    it('applies the check to a bare array as well', () => {
      expect(extractAIImport(JSON.stringify([{ ...validItem, portionSize: 150 }])).success).toBe(false);
    });
  });
});
