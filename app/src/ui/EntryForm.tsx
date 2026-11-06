import { ReactNode, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { NutrientField, NutrientFields, parseNutrientFields } from '../domain/entryForm';
import type { FieldErrors } from '../domain/formParser';
import type { EntryInput, MealType } from '../domain/types';
import { DateTimeChips } from './DateTimeChips';
import { MealTypeChips } from './MealTypeChips';
import { NutrientInputs } from './NutrientInputs';

export interface EntryFormValues {
  fields: NutrientFields;
  mealType: MealType | null;
  eatenAt: string;
  /** Whether eatenAt has an explicit time; otherwise the time chip says "now". */
  timePicked: boolean;
}

interface EntryFormProps {
  initial: EntryFormValues;
  submitLabel: string;
  onSubmit: (input: EntryInput) => void;
  /** Extra content below the form, e.g. details and actions of the edit screen. */
  children?: ReactNode;
}

/** The entry form of the add and edit screens (9.2). */
export function EntryForm({ initial, submitLabel, onSubmit, children }: EntryFormProps) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<NutrientField>>({});

  const update = (patch: Partial<EntryFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const submit = () => {
    const result = parseNutrientFields(values.fields);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit({ ...result.value, mealType: values.mealType, eatenAt: values.eatenAt });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <NutrientInputs
        fields={values.fields}
        errors={errors}
        onChange={(field, value) => update({ fields: { ...values.fields, [field]: value } })}
      />
      <Text variant="labelLarge" style={styles.label}>
        Meal
      </Text>
      <MealTypeChips value={values.mealType} onChange={(mealType) => update({ mealType })} eatenAt={values.eatenAt} />
      <Text variant="labelLarge" style={styles.label}>
        Eaten at
      </Text>
      <DateTimeChips
        eatenAt={values.eatenAt}
        onChange={(eatenAt) => update({ eatenAt })}
        timePicked={values.timePicked}
        onTimePicked={() => update({ timePicked: true })}
      />
      <Button mode="contained" onPress={submit} style={styles.submit}>
        {submitLabel}
      </Button>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  label: { marginTop: 8, marginBottom: 4 },
  submit: { marginTop: 8 }
});
