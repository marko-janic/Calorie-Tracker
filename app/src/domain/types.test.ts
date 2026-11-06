import { EntrySchema, LocalTimestampSchema, ProfileSchema, UtcTimestampSchema } from './types';

describe('UtcTimestampSchema (loggedAt, updatedAt)', () => {
  it('accepts exactly three fraction digits with Z', () => {
    expect(UtcTimestampSchema.safeParse('2026-11-03T11:31:02.120Z').success).toBe(true);
  });

  it.each([
    ['no fraction', '2026-11-03T11:31:02Z'],
    ['one fraction digit', '2026-11-03T11:31:02.1Z'],
    ['two fraction digits', '2026-11-03T11:31:02.12Z'],
    ['four fraction digits', '2026-11-03T11:31:02.1200Z'],
    ['an offset instead of Z', '2026-11-03T12:31:02.120+01:00'],
    ['a zero offset instead of Z', '2026-11-03T11:31:02.120+00:00'],
    ['no seconds', '2026-11-03T11:31Z'],
    ['no time zone', '2026-11-03T11:31:02.120'],
    ['an invalid date', '2026-02-30T11:31:02.120Z']
  ])('rejects %s', (_, value) => {
    expect(UtcTimestampSchema.safeParse(value).success).toBe(false);
  });
});

describe('LocalTimestampSchema (eatenAt)', () => {
  it.each([
    ['a positive offset', '2026-11-03T12:30:00+01:00'],
    ['a negative offset', '2026-11-03T07:30:00-04:00'],
    ['Z', '2026-11-03T11:30:00Z'],
    ['one fraction digit', '2026-11-03T12:30:00.1+01:00'],
    ['two fraction digits', '2026-11-03T12:30:00.12+01:00'],
    ['three fraction digits (server format)', '2026-11-03T12:30:00.000+01:00'],
    ['three fraction digits with Z', '2026-11-03T11:30:00.000Z']
  ])('accepts %s', (_, value) => {
    expect(LocalTimestampSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['four fraction digits', '2026-11-03T12:30:00.1234+01:00'],
    ['seven fraction digits', '2026-11-03T12:30:00.1234567Z'],
    ['no offset', '2026-11-03T12:30:00'],
    ['an offset without colon', '2026-11-03T12:30:00+0100'],
    ['an hour-only offset', '2026-11-03T12:30:00+01'],
    ['no seconds', '2026-11-03T12:30+01:00'],
    ['an invalid date', '2026-02-30T12:30:00+01:00']
  ])('rejects %s', (_, value) => {
    expect(LocalTimestampSchema.safeParse(value).success).toBe(false);
  });
});

describe('EntrySchema', () => {
  const entry = {
    id: '0193e7a2-5c1e-7b3a-9d4f-2a1b3c4d5e6f',
    name: 'Chicken breast, grilled (200 g)',
    kcal: 330,
    proteinG: 62,
    carbsG: 0,
    fatG: 7.2,
    fibreG: 0,
    quantity: 1,
    mealType: null,
    notes: null,
    eatenAt: '2026-11-03T12:30:00+01:00',
    eatenLocalDate: '2026-11-03',
    loggedAt: '2026-11-03T11:30:55.004Z',
    updatedAt: '2026-11-03T11:31:02.120Z',
    deleted: false
  };

  it('accepts a valid entry', () => {
    expect(EntrySchema.safeParse(entry).success).toBe(true);
  });

  it('rejects a loggedAt without milliseconds', () => {
    expect(EntrySchema.safeParse({ ...entry, loggedAt: '2026-11-03T11:30:55Z' }).success).toBe(false);
  });

  it('rejects an updatedAt with an offset', () => {
    expect(EntrySchema.safeParse({ ...entry, updatedAt: '2026-11-03T12:31:02.120+01:00' }).success).toBe(false);
  });

  it('rejects an eatenAt with more than three fraction digits', () => {
    expect(EntrySchema.safeParse({ ...entry, eatenAt: '2026-11-03T12:30:00.0001+01:00' }).success).toBe(false);
  });

  it('rejects an eatenLocalDate that differs from the date part of eatenAt', () => {
    expect(EntrySchema.safeParse({ ...entry, eatenLocalDate: '2026-11-02' }).success).toBe(false);
  });
});

describe('ProfileSchema', () => {
  const profile = {
    sex: 'male',
    birthYear: 1996,
    heightCm: 180,
    weightKg: 80,
    bodyFatPercent: null,
    activityLevel: 'moderate',
    goalKgPerWeek: -0.5,
    targets: null,
    updatedAt: '2026-11-03T11:31:02.120Z'
  };

  it('accepts a valid profile', () => {
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('rejects an updatedAt without milliseconds', () => {
    expect(ProfileSchema.safeParse({ ...profile, updatedAt: '2026-11-03T11:31:02Z' }).success).toBe(false);
  });
});
