import {
  calculateTotals,
  roundTo1Decimal,
  formatEntryKcal,
  formatMacroLine,
  formatNumber,
  formatNutrientTotal,
  parseDecimalInput
} from './totals';
import { Entry } from './types';

const createEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'test-id',
  name: 'Test',
  kcal: 100,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  fibreG: 2,
  quantity: 1,
  mealType: null,
  notes: null,
  eatenAt: '2026-11-03T12:00:00+01:00',
  eatenLocalDate: '2026-11-03',
  loggedAt: '2026-11-03T12:00:00Z',
  updatedAt: '2026-11-03T12:00:00Z',
  deleted: false,
  ...overrides
});

describe('calculateTotals', () => {
  it('sums nutrients correctly', () => {
    const entries = [
      createEntry({ kcal: 100, proteinG: 10, carbsG: 20, fatG: 5, fibreG: 2 }),
      createEntry({ kcal: 200, proteinG: 20, carbsG: 30, fatG: 10, fibreG: 3 })
    ];

    const totals = calculateTotals(entries);

    expect(totals.kcal).toBe(300);
    expect(totals.protein.value).toBe(30);
    expect(totals.carbs.value).toBe(50);
    expect(totals.fat.value).toBe(15);
    expect(totals.fibre.value).toBe(5);
  });

  it('applies quantity multiplier', () => {
    const entries = [
      createEntry({ kcal: 100, proteinG: 10, quantity: 2 })
    ];

    const totals = calculateTotals(entries);

    expect(totals.kcal).toBe(200);
    expect(totals.protein.value).toBe(20);
  });

  it('tracks unknown nutrients', () => {
    const entries = [
      createEntry({ proteinG: 10, carbsG: null, fatG: null }),
      createEntry({ proteinG: null, carbsG: 20, fatG: null })
    ];

    const totals = calculateTotals(entries);

    expect(totals.protein.unknownCount).toBe(1);
    expect(totals.carbs.unknownCount).toBe(1);
    expect(totals.fat.unknownCount).toBe(2);
  });

  it('skips deleted entries', () => {
    const entries = [
      createEntry({ kcal: 100, deleted: false }),
      createEntry({ kcal: 200, deleted: true })
    ];

    const totals = calculateTotals(entries);

    expect(totals.kcal).toBe(100);
  });

  it('rounds kcal to whole numbers', () => {
    const entries = [
      createEntry({ kcal: 100.4 }),
      createEntry({ kcal: 100.6 })
    ];

    const totals = calculateTotals(entries);

    expect(totals.kcal).toBe(201);
  });

  it('rounds grams to 1 decimal', () => {
    const entries = [
      createEntry({ proteinG: 10.15 }),
      createEntry({ proteinG: 10.16 })
    ];

    const totals = calculateTotals(entries);

    expect(totals.protein.value).toBe(20.3);
  });
});

describe('roundTo1Decimal', () => {
  it('rounds correctly', () => {
    expect(roundTo1Decimal(10.14)).toBe(10.1);
    expect(roundTo1Decimal(10.15)).toBe(10.2);
    expect(roundTo1Decimal(10.0)).toBe(10);
  });
});

describe('formatNumber', () => {
  it('drops trailing .0', () => {
    expect(formatNumber(10.0, 1)).toBe('10');
    expect(formatNumber(10.1, 1)).toBe('10.1');
    expect(formatNumber(10.12, 1)).toBe('10.1');
  });
});

describe('formatNutrientTotal', () => {
  it('formats with unknown count', () => {
    expect(formatNutrientTotal({ value: 18, unknownCount: 2 })).toBe('18 g · 2 unknown');
  });

  it('formats without unknown count', () => {
    expect(formatNutrientTotal({ value: 18.5, unknownCount: 0 })).toBe('18.5 g');
  });
});

describe('parseDecimalInput', () => {
  it('accepts dot as decimal separator', () => {
    expect(parseDecimalInput('12.5')).toBe(12.5);
  });

  it('accepts comma as decimal separator', () => {
    expect(parseDecimalInput('12,5')).toBe(12.5);
  });

  it('ignores spaces', () => {
    expect(parseDecimalInput(' 1 000 ')).toBe(1000);
    expect(parseDecimalInput(' 12.5 ')).toBe(12.5);
  });

  it('rejects trailing garbage', () => {
    expect(parseDecimalInput('12abc')).toBeNull();
    expect(parseDecimalInput('12.5x')).toBeNull();
  });

  it('rejects multiple separators', () => {
    expect(parseDecimalInput('1,2,3')).toBeNull();
    expect(parseDecimalInput('1.2.3')).toBeNull();
  });

  it('accepts whole numbers', () => {
    expect(parseDecimalInput('123')).toBe(123);
  });

  it('rejects leading decimal point without digit', () => {
    expect(parseDecimalInput('.5')).toBeNull(); // No leading digit
  });

  it('rejects empty or invalid input', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('-')).toBeNull();
  });

  it('rejects negative numbers', () => {
    expect(parseDecimalInput('-3')).toBeNull();
    expect(parseDecimalInput('-12.5')).toBeNull();
  });
});

describe('formatEntryKcal', () => {
  it('applies the quantity and rounds to whole kcal', () => {
    expect(formatEntryKcal({ kcal: 330, quantity: 2 })).toBe('660 kcal');
    expect(formatEntryKcal({ kcal: 95.4, quantity: 1 })).toBe('95 kcal');
  });
});

describe('formatMacroLine', () => {
  it('lists known nutrients scaled by quantity', () => {
    expect(formatMacroLine({ proteinG: 62, carbsG: 0, fatG: 7.2, fibreG: 0.5, quantity: 2 }))
      .toBe('Protein 124 g · Carbs 0 g · Fat 14.4 g · Fibre 1 g');
  });

  it('leaves out unknown nutrients', () => {
    expect(formatMacroLine({ proteinG: 10, carbsG: null, fatG: null, fibreG: 2, quantity: 1 }))
      .toBe('Protein 10 g · Fibre 2 g');
    expect(formatMacroLine({ proteinG: null, carbsG: null, fatG: null, fibreG: null, quantity: 1 })).toBe('');
  });
});
