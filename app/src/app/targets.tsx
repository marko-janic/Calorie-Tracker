import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, HelperText, Portal, SegmentedButtons, Text } from 'react-native-paper';

import { calculate, CalculatorOutput, getCurrentYear } from '../calc/calculator';
import { getProfile, saveProfile } from '../db/profile';
import {
  BodyField,
  bodyFieldsFrom,
  BodyFields,
  EMPTY_BODY_FIELDS,
  parseBodyFields,
  parseTargetFields,
  TargetField,
  targetFieldsFrom,
  TargetFields,
  toCalculatorInput
} from '../domain/profileForm';
import type { FieldErrors } from '../domain/formParser';
import { formatGrams, formatKcal } from '../domain/totals';
import type { ActivityLevel, GoalKgPerWeek, Sex } from '../domain/types';
import { useDatabase } from '../ui/DatabaseProvider';
import { NumberField } from '../ui/NumberField';

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary – desk job' },
  { value: 'light', label: 'Light – 1–3 workouts per week' },
  { value: 'moderate', label: 'Moderate – 3–5 per week' },
  { value: 'active', label: 'Active – 6–7 per week' },
  { value: 'veryActive', label: 'Very active – physical job plus training' }
];

const GOALS: { value: GoalKgPerWeek; label: string }[] = [
  { value: -0.5, label: '−0.5' },
  { value: -0.25, label: '−0.25' },
  { value: 0, label: '0' },
  { value: 0.25, label: '+0.25' }
];

const TARGETS: { field: TargetField; label: string; unit: 'kcal' | 'g' }[] = [
  { field: 'kcal', label: 'Energy', unit: 'kcal' },
  { field: 'proteinG', label: 'Protein', unit: 'g' },
  { field: 'carbsG', label: 'Carbs', unit: 'g' },
  { field: 'fatG', label: 'Fat', unit: 'g' },
  { field: 'fibreG', label: 'Fibre', unit: 'g' }
];

/** Profile, target calculator and the current targets, each overridable (5.5, 5.6, 9.2). */
export default function TargetsScreen() {
  const db = useDatabase();
  const currentYear = getCurrentYear();
  const [initial] = useState(() => getProfile(db));
  const [body, setBody] = useState<BodyFields>(() => (initial ? bodyFieldsFrom(initial, currentYear) : EMPTY_BODY_FIELDS));
  const [targets, setTargets] = useState<TargetFields>(() => targetFieldsFrom(initial?.targets ?? null));
  const [bodyErrors, setBodyErrors] = useState<FieldErrors<BodyField>>({});
  const [targetErrors, setTargetErrors] = useState<FieldErrors<TargetField>>({});
  const [confirmRecalculate, setConfirmRecalculate] = useState(false);

  const parsedBody = parseBodyFields(body, currentYear);
  const suggestion: CalculatorOutput | null = parsedBody.ok ? calculate(toCalculatorInput(parsedBody.value, currentYear)) : null;
  const hasTargets = Object.values(targets).some((value) => value.trim() !== '');

  const updateBody = (patch: Partial<BodyFields>) => setBody((current) => ({ ...current, ...patch }));

  const applySuggestion = () => {
    if (suggestion) {
      setTargets(targetFieldsFrom(suggestion));
      setTargetErrors({});
    }
    setConfirmRecalculate(false);
  };

  const save = () => {
    const bodyResult = parseBodyFields(body, currentYear);
    const targetResult = parseTargetFields(targets);
    setBodyErrors(bodyResult.ok ? {} : bodyResult.errors);
    setTargetErrors(targetResult.ok ? {} : targetResult.errors);
    if (bodyResult.ok && targetResult.ok) {
      saveProfile(db, { ...bodyResult.value, targets: targetResult.value });
      router.back();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium" style={styles.heading}>
        Profile
      </Text>
      <SegmentedButtons
        value={body.sex ?? ''}
        onValueChange={(value) => updateBody({ sex: value as Sex })}
        buttons={[
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' }
        ]}
        style={styles.segmented}
      />
      {bodyErrors.sex ? <HelperText type="error">Choose one</HelperText> : null}
      <View style={styles.row}>
        <View style={styles.cell}>
          <NumberField label="Age" integer value={body.age} onChangeText={(age) => updateBody({ age })} error={bodyErrors.age} />
        </View>
        <View style={styles.cell}>
          <NumberField label="Body fat (optional)" suffix="%" value={body.bodyFatPercent} onChangeText={(bodyFatPercent) => updateBody({ bodyFatPercent })} error={bodyErrors.bodyFatPercent} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <NumberField label="Height" suffix="cm" value={body.heightCm} onChangeText={(heightCm) => updateBody({ heightCm })} error={bodyErrors.heightCm} />
        </View>
        <View style={styles.cell}>
          <NumberField label="Weight" suffix="kg" value={body.weightKg} onChangeText={(weightKg) => updateBody({ weightKg })} error={bodyErrors.weightKg} />
        </View>
      </View>

      <Text variant="labelLarge" style={styles.label}>
        Activity
      </Text>
      <View>
        {ACTIVITY_LEVELS.map((level) => (
          <Button
            key={level.value}
            mode={body.activityLevel === level.value ? 'contained-tonal' : 'outlined'}
            onPress={() => updateBody({ activityLevel: level.value })}
            style={styles.option}
          >
            {level.label}
          </Button>
        ))}
      </View>
      {bodyErrors.activityLevel ? <HelperText type="error">Choose one</HelperText> : null}

      <Text variant="labelLarge" style={styles.label}>
        Goal (kg per week)
      </Text>
      <SegmentedButtons
        value={String(body.goalKgPerWeek)}
        onValueChange={(value) => updateBody({ goalKgPerWeek: Number(value) as GoalKgPerWeek })}
        buttons={GOALS.map((goal) => ({ value: String(goal.value), label: goal.label }))}
        style={styles.segmented}
      />

      <Card style={styles.card}>
        <Card.Title title="Suggested targets" />
        <Card.Content>
          {suggestion ? (
            <>
              <Text variant="bodyMedium">
                {`BMR ${formatKcal(suggestion.bmr)} kcal · TDEE ${formatKcal(suggestion.tdee)} kcal`}
              </Text>
              <Text variant="bodyMedium">
                {`${formatKcal(suggestion.kcal)} kcal · Protein ${formatGrams(suggestion.proteinG)} g · Carbs ${formatGrams(suggestion.carbsG)} g · Fat ${formatGrams(suggestion.fatG)} g · Fibre ${formatGrams(suggestion.fibreG)} g`}
              </Text>
            </>
          ) : (
            <Text variant="bodyMedium">Fill in the profile to see suggestions.</Text>
          )}
        </Card.Content>
        <Card.Actions>
          <Button disabled={!suggestion} onPress={() => (hasTargets ? setConfirmRecalculate(true) : applySuggestion())}>
            {hasTargets ? 'Recalculate' : 'Use suggestions'}
          </Button>
        </Card.Actions>
      </Card>

      <Text variant="titleMedium" style={styles.heading}>
        Daily targets
      </Text>
      {TARGETS.map(({ field, label, unit }) => (
        <NumberField
          key={field}
          label={label}
          suffix={unit}
          value={targets[field]}
          onChangeText={(value) => setTargets((current) => ({ ...current, [field]: value }))}
          error={targetErrors[field]}
        />
      ))}

      <Button mode="contained" onPress={save} style={styles.save}>
        Save
      </Button>

      <Portal>
        <Dialog visible={confirmRecalculate} onDismiss={() => setConfirmRecalculate(false)}>
          <Dialog.Title>Recalculate targets?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">All targets are replaced with the suggested values.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmRecalculate(false)}>Cancel</Button>
            <Button onPress={applySuggestion}>Recalculate</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  heading: { marginTop: 8, marginBottom: 8 },
  label: { marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  segmented: { marginBottom: 8 },
  option: { marginBottom: 4 },
  card: { marginVertical: 12 },
  save: { marginTop: 8 }
});
