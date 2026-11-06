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
});
