import { inferMealType, getComputedMealType, groupByMeal } from './mealInference';
import { Entry } from './types';

describe('inferMealType', () => {
  it('infers breakfast for 04:00–10:29', () => {
    expect(inferMealType('2026-11-03T04:00:00+01:00')).toBe('breakfast');
    expect(inferMealType('2026-11-03T10:29:00+01:00')).toBe('breakfast');
  });

  it('infers lunch for 10:30–14:29', () => {
    expect(inferMealType('2026-11-03T10:30:00+01:00')).toBe('lunch');
    expect(inferMealType('2026-11-03T14:29:00+01:00')).toBe('lunch');
  });

  it('infers snack for 14:30–17:29', () => {
    expect(inferMealType('2026-11-03T14:30:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T17:29:00+01:00')).toBe('snack');
  });

  it('infers dinner for 17:30–21:29', () => {
    expect(inferMealType('2026-11-03T17:30:00+01:00')).toBe('dinner');
    expect(inferMealType('2026-11-03T21:29:00+01:00')).toBe('dinner');
  });

  it('infers snack for 21:30–03:59', () => {
    expect(inferMealType('2026-11-03T21:30:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T23:59:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T00:00:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T03:59:00+01:00')).toBe('snack');
  });

  it('handles exact boundaries correctly', () => {
    expect(inferMealType('2026-11-03T03:59:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T04:00:00+01:00')).toBe('breakfast');
    expect(inferMealType('2026-11-03T10:29:00+01:00')).toBe('breakfast');
    expect(inferMealType('2026-11-03T10:30:00+01:00')).toBe('lunch');
    expect(inferMealType('2026-11-03T14:29:00+01:00')).toBe('lunch');
    expect(inferMealType('2026-11-03T14:30:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T17:29:00+01:00')).toBe('snack');
    expect(inferMealType('2026-11-03T17:30:00+01:00')).toBe('dinner');
    expect(inferMealType('2026-11-03T21:29:00+01:00')).toBe('dinner');
    expect(inferMealType('2026-11-03T21:30:00+01:00')).toBe('snack');
  });
});

describe('getComputedMealType', () => {
  it('returns explicit meal type when set', () => {
    expect(getComputedMealType('breakfast', '2026-11-03T18:00:00+01:00')).toBe('breakfast');
    expect(getComputedMealType('lunch', '2026-11-03T04:00:00+01:00')).toBe('lunch');
  });

  it('infers meal type when null', () => {
    expect(getComputedMealType(null, '2026-11-03T08:00:00+01:00')).toBe('breakfast');
    expect(getComputedMealType(null, '2026-11-03T12:00:00+01:00')).toBe('lunch');
  });
});

describe('groupByMeal', () => {
  let counter = 0;
  const entry = (eatenAt: string, overrides: Partial<Entry> = {}): Entry => ({
    id: `id-${++counter}`,
    name: 'Test',
    kcal: 100,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fibreG: null,
    quantity: 1,
    mealType: null,
    notes: null,
    eatenAt,
    eatenLocalDate: eatenAt.substring(0, 10),
    loggedAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    deleted: false,
    ...overrides
  });

  it('groups in the order breakfast, lunch, dinner, snack and skips empty groups', () => {
    const groups = groupByMeal([
      entry('2026-11-03T22:00:00+01:00'),
      entry('2026-11-03T12:00:00+01:00'),
      entry('2026-11-03T08:00:00+01:00')
    ]);
    expect(groups.map((group) => group.mealType)).toEqual(['breakfast', 'lunch', 'snack']);
  });

  it('uses an explicit meal type over the inferred one', () => {
    const groups = groupByMeal([entry('2026-11-03T15:00:00+01:00', { mealType: 'lunch' })]);
    expect(groups.map((group) => group.mealType)).toEqual(['lunch']);
  });

  it('orders entries chronologically by local time, regardless of offset and fraction digits', () => {
    const late = entry('2026-11-03T12:40:00.000+01:00', { name: 'late' });
    const early = entry('2026-11-03T12:10:00-05:00', { name: 'early' });
    const [lunch] = groupByMeal([late, early]);
    expect(lunch.entries.map((e) => e.name)).toEqual(['early', 'late']);
  });

  it('computes kcal subtotals including the quantity', () => {
    const [lunch] = groupByMeal([
      entry('2026-11-03T12:00:00+01:00', { kcal: 330, quantity: 2 }),
      entry('2026-11-03T12:30:00+01:00', { kcal: 195 })
    ]);
    expect(lunch.kcal).toBe(855);
  });

  it('skips deleted entries', () => {
    expect(groupByMeal([entry('2026-11-03T12:00:00+01:00', { deleted: true })])).toEqual([]);
  });
});
