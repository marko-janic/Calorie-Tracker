import { Sex, ActivityLevel, Targets } from '../domain/types';

export interface CalculatorInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPercent: number | null;
  activityLevel: ActivityLevel;
  goalKgPerWeek: number; // -0.5, -0.25, 0, 0.25
}

export interface CalculatorOutput extends Targets {
  bmr: number;
  tdee: number;
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9
};

/**
 * Calculate BMR, TDEE and target nutrients.
 *
 * Based on section 5.6 of the plan:
 * - Uses Katch-McArdle if body fat is given, otherwise Mifflin-St Jeor
 * - TDEE = BMR × activity factor
 * - kcal = roundTo10(max(BMR, TDEE + goalKgPerWeek × 7700 / 7))
 * - Protein = 2.2 × LBM (if body fat given) or 1.8 × weight
 * - Fat = 0.30 × kcal / 9
 * - Fibre = 14 × kcal / 1000
 * - Carbs = max(0, (kcal - 4×protein - 9×fat - 2×fibre) / 4)
 */
export function calculate(input: CalculatorInput): CalculatorOutput {
  const { sex, age, heightCm, weightKg, bodyFatPercent, activityLevel, goalKgPerWeek } = input;

  // Calculate LBM if body fat is given
  const lbm = bodyFatPercent !== null ? weightKg * (1 - bodyFatPercent / 100) : null;

  // Calculate BMR
  let bmr: number;
  if (lbm !== null) {
    // Katch-McArdle
    bmr = 370 + 21.6 * lbm;
  } else {
    // Mifflin-St Jeor
    if (sex === 'male') {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }
  }

  // Calculate TDEE
  const activityFactor = ACTIVITY_FACTORS[activityLevel];
  const tdee = bmr * activityFactor;

  // Calculate target kcal
  // goalKgPerWeek × 7700 kcal/kg / 7 days = daily adjustment
  const adjustment = goalKgPerWeek * 7700 / 7;
  const targetKcalExact = Math.max(bmr, tdee + adjustment);
  const kcal = roundTo10(targetKcalExact);

  // Calculate target nutrients (using rounded kcal)
  const proteinG = lbm !== null ? 2.2 * lbm : 1.8 * weightKg;
  const fatG = (0.30 * kcal) / 9;
  const fibreG = (14 * kcal) / 1000;

  // EU factors: protein 4 kcal/g, fat 9 kcal/g, carbs 4 kcal/g, fibre 2 kcal/g
  const remainingKcal = kcal - (4 * proteinG) - (9 * fatG) - (2 * fibreG);
  const carbsG = Math.max(0, remainingKcal / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    fibreG: Math.round(fibreG)
  };
}

/**
 * Round to nearest 10
 */
function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}

/**
 * Get current year (for birthYear to age conversion)
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Convert age to birth year
 */
export function ageToBirthYear(age: number): number {
  return getCurrentYear() - age;
}

/**
 * Convert birth year to age
 */
export function birthYearToAge(birthYear: number): number {
  return getCurrentYear() - birthYear;
}
