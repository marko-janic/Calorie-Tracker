import { calculate } from './calculator';

describe('calculator', () => {
  it('calculates the worked example from the plan', () => {
    // From section 5.6:
    // Male, 30 years, 180 cm, 80 kg, no body fat, moderate activity, -0.5 kg/week
    // Expected: BMR 1780, TDEE 2759, kcal 2210, protein 144g, fat 74g, fibre 31g, carbs 227g
    const result = calculate({
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      bodyFatPercent: null,
      activityLevel: 'moderate',
      goalKgPerWeek: -0.5
    });

    expect(result.bmr).toBe(1780);
    expect(result.tdee).toBe(2759);
    expect(result.kcal).toBe(2210);
    expect(result.proteinG).toBe(144);
    expect(result.fatG).toBe(74);
    expect(result.fibreG).toBe(31);
    expect(result.carbsG).toBe(227);
  });

  it('uses Katch-McArdle when body fat is given', () => {
    const result = calculate({
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      bodyFatPercent: 15, // 15% body fat
      activityLevel: 'moderate',
      goalKgPerWeek: 0
    });

    // LBM = 80 × (1 - 0.15) = 68 kg
    // BMR = 370 + 21.6 × 68 = 1838.8 ≈ 1839
    expect(result.bmr).toBe(1839);

    // Protein should be 2.2 × 68 = 149.6 ≈ 150
    expect(result.proteinG).toBe(150);
  });

  it('uses Mifflin-St Jeor for females', () => {
    const result = calculate({
      sex: 'female',
      age: 30,
      heightCm: 165,
      weightKg: 60,
      bodyFatPercent: null,
      activityLevel: 'light',
      goalKgPerWeek: 0
    });

    // BMR = 10×60 + 6.25×165 - 5×30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
    expect(result.bmr).toBe(1320);
  });

  it('respects BMR floor when goal creates deficit', () => {
    const result = calculate({
      sex: 'female',
      age: 40,
      heightCm: 160,
      weightKg: 55,
      bodyFatPercent: null,
      activityLevel: 'sedentary',
      goalKgPerWeek: -0.5
    });

    // BMR should be the floor even with a -550 kcal/day goal
    expect(result.kcal).toBeGreaterThanOrEqual(result.bmr);
  });

  it('handles maintenance goal (0 kg/week)', () => {
    const result = calculate({
      sex: 'male',
      age: 25,
      heightCm: 175,
      weightKg: 75,
      bodyFatPercent: null,
      activityLevel: 'active',
      goalKgPerWeek: 0
    });

    // With 0 goal, kcal should equal TDEE (rounded to 10)
    const expectedKcal = Math.round(result.tdee / 10) * 10;
    expect(result.kcal).toBe(expectedKcal);
  });

  it('handles gain goal (+0.25 kg/week)', () => {
    const result = calculate({
      sex: 'male',
      age: 25,
      heightCm: 175,
      weightKg: 65,
      bodyFatPercent: null,
      activityLevel: 'active',
      goalKgPerWeek: 0.25
    });

    // +0.25 kg/week = +275 kcal/day
    // kcal should be TDEE + 275 (rounded to 10)
    expect(result.kcal).toBeGreaterThan(result.tdee);
  });

  it('ensures carbs is never negative', () => {
    // Edge case with very high protein/fat relative to kcal
    const result = calculate({
      sex: 'female',
      age: 50,
      heightCm: 150,
      weightKg: 45,
      bodyFatPercent: null,
      activityLevel: 'sedentary',
      goalKgPerWeek: -0.5
    });

    expect(result.carbsG).toBeGreaterThanOrEqual(0);
  });
});
