import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { inferMealType, MEAL_TYPE_LABELS, MEAL_TYPES } from '../domain/mealInference';
import type { MealType } from '../domain/types';

interface MealTypeChipsProps {
  value: MealType | null;
  onChange: (mealType: MealType | null) => void;
  /** The eatenAt that Auto is computed from, e.g. "Auto (Lunch)" (5.3). */
  eatenAt: string;
  /** Overrides the Auto label, e.g. for the AI import batch. */
  autoLabel?: string;
}

/** Meal type: Auto / Breakfast / Lunch / Dinner / Snack. */
export function MealTypeChips({ value, onChange, eatenAt, autoLabel }: MealTypeChipsProps) {
  return (
    <View style={styles.row}>
      <Chip selected={value === null} showSelectedOverlay onPress={() => onChange(null)} style={styles.chip}>
        {autoLabel ?? `Auto (${MEAL_TYPE_LABELS[inferMealType(eatenAt)]})`}
      </Chip>
      {MEAL_TYPES.map((mealType) => (
        <Chip
          key={mealType}
          selected={value === mealType}
          showSelectedOverlay
          onPress={() => onChange(mealType)}
          style={styles.chip}
        >
          {MEAL_TYPE_LABELS[mealType]}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: { marginRight: 8, marginBottom: 4 }
});
