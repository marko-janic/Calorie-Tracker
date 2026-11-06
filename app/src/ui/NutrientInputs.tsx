import { StyleSheet, View } from 'react-native';
import { HelperText, Text, TextInput } from 'react-native-paper';

import type { NutrientField, NutrientFields } from '../domain/entryForm';
import type { FieldErrors } from '../domain/formParser';
import { formatKcal, parseDecimalInput } from '../domain/totals';
import { NumberField } from './NumberField';
import { INPUT_THEME } from './theme';

interface NutrientInputsProps {
  fields: NutrientFields;
  errors: FieldErrors<NutrientField>;
  onChange: (field: NutrientField, value: string) => void;
}

/** Name, kcal, macros, quantity and notes of an entry, with the live total for quantities other than 1 (9.2). */
export function NutrientInputs({ fields, errors, onChange }: NutrientInputsProps) {
  const kcal = parseDecimalInput(fields.kcal);
  const quantity = parseDecimalInput(fields.quantity);
  const liveTotal = kcal !== null && quantity !== null && quantity !== 1 ? `= ${formatKcal(kcal * quantity)} kcal` : null;

  return (
    <View>
      <TextInput
        mode="outlined"
        theme={INPUT_THEME}
        label="Name"
        value={fields.name}
        onChangeText={(value) => onChange('name', value)}
        error={errors.name !== undefined}
        dense
      />
      {errors.name ? <HelperText type="error">{errors.name}</HelperText> : <View style={styles.gap} />}
      <View style={styles.row}>
        <View style={styles.cell}>
          <NumberField label="kcal" value={fields.kcal} onChangeText={(value) => onChange('kcal', value)} error={errors.kcal} />
        </View>
        <View style={styles.cell}>
          <NumberField
            label="Quantity"
            value={fields.quantity}
            onChangeText={(value) => onChange('quantity', value)}
            error={errors.quantity}
          />
        </View>
      </View>
      {liveTotal ? (
        <Text variant="bodyMedium" style={styles.liveTotal}>
          {liveTotal}
        </Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.cell}>
          <NumberField label="Protein" suffix="g" value={fields.proteinG} onChangeText={(value) => onChange('proteinG', value)} error={errors.proteinG} />
        </View>
        <View style={styles.cell}>
          <NumberField label="Carbs" suffix="g" value={fields.carbsG} onChangeText={(value) => onChange('carbsG', value)} error={errors.carbsG} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <NumberField label="Fat" suffix="g" value={fields.fatG} onChangeText={(value) => onChange('fatG', value)} error={errors.fatG} />
        </View>
        <View style={styles.cell}>
          <NumberField label="Fibre" suffix="g" value={fields.fibreG} onChangeText={(value) => onChange('fibreG', value)} error={errors.fibreG} />
        </View>
      </View>
      <TextInput
        mode="outlined"
        theme={INPUT_THEME}
        label="Notes"
        value={fields.notes}
        onChangeText={(value) => onChange('notes', value)}
        error={errors.notes !== undefined}
        multiline
        dense
      />
      {errors.notes ? <HelperText type="error">{errors.notes}</HelperText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  gap: { height: 8 },
  liveTotal: { marginBottom: 8 }
});
