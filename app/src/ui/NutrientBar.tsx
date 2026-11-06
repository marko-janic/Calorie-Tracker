import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';

import { formatGrams, formatKcal } from '../domain/totals';
import type { NutrientTotal } from '../domain/types';

interface NutrientBarProps {
  label: string;
  total: NutrientTotal;
  unit: 'kcal' | 'g';
  /** The daily target; without one only the total is shown. */
  target: number | null;
}

/** One nutrient of the day summary: total versus target with a progress bar and "· n unknown" (9.2). */
export function NutrientBar({ label, total, unit, target }: NutrientBarProps) {
  const format = unit === 'kcal' ? formatKcal : formatGrams;
  const value = `${format(total.value)}${target !== null ? ` / ${format(target)}` : ''} ${unit}`;
  const unknown = total.unknownCount > 0 ? ` · ${total.unknownCount} unknown` : '';
  const progress = target !== null && target > 0 ? Math.min(total.value / target, 1) : 0;
  const variant = unit === 'kcal' ? 'titleMedium' : 'bodyMedium';

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text variant={variant}>{label}</Text>
        <Text variant={variant}>
          {value}
          {unknown}
        </Text>
      </View>
      {target !== null ? <ProgressBar progress={progress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }
});
