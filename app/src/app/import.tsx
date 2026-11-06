import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, IconButton, Text, TextInput } from 'react-native-paper';

import { extractAIImport } from '../ai/extract';
import { buildPrompt } from '../ai/prompt';
import type { AIItem } from '../ai/schema';
import { createEntries } from '../db/entries';
import { NutrientField, NutrientFields, parseNutrientFields } from '../domain/entryForm';
import type { FieldErrors } from '../domain/formParser';
import { changeEatenDate, getNowLocal, getTodayLocalDate, isLocalDate } from '../domain/time';
import type { EntryInput, MealType } from '../domain/types';
import { DateTimeChips } from '../ui/DateTimeChips';
import { useDatabase } from '../ui/DatabaseProvider';
import { MealTypeChips } from '../ui/MealTypeChips';
import { NutrientInputs } from '../ui/NutrientInputs';
import { useSnackbar } from '../ui/SnackbarProvider';
import { INPUT_THEME } from '../ui/theme';

/** The description is kept as a draft until the import is saved (10.1). */
let descriptionDraft = '';

interface PreviewItem {
  key: number;
  fields: NutrientFields;
  /** The meal type the AI provided, used when the batch meal type is Auto. */
  mealType: MealType | null;
  errors: FieldErrors<NutrientField>;
}

function toPreviewItem(item: AIItem, key: number): PreviewItem {
  const grams = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));
  return {
    key,
    fields: {
      name: item.name,
      kcal: String(item.kcal),
      proteinG: grams(item.protein_g),
      carbsG: grams(item.carbs_g),
      fatG: grams(item.fat_g),
      fibreG: grams(item.fibre_g),
      quantity: '1',
      notes: item.notes ?? ''
    },
    mealType: item.mealType ?? null,
    errors: {}
  };
}

/** AI import (10.1): copy prompt, paste the answer, check, edit the preview, save all. */
export default function AIImport() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const db = useDatabase();
  const showSnackbar = useSnackbar();

  const [description, setDescription] = useState(descriptionDraft);
  const [answer, setAnswer] = useState('');
  const [problems, setProblems] = useState<{ error: string; details: string[] } | null>(null);
  const [extraKeys, setExtraKeys] = useState(false);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [eatenAt, setEatenAt] = useState(() => {
    const now = getNowLocal();
    return date && isLocalDate(date) && date !== getTodayLocalDate() ? changeEatenDate(now, date) : now;
  });
  const [timePicked, setTimePicked] = useState(false);
  const [batchMealType, setBatchMealType] = useState<MealType | null>(null);

  const changeDescription = (text: string) => {
    descriptionDraft = text;
    setDescription(text);
  };

  const copyPrompt = async () => {
    await Clipboard.setStringAsync(buildPrompt(description.trim() || undefined));
    showSnackbar('Prompt copied – paste it into your AI chat');
  };

  const check = () => {
    const result = extractAIImport(answer);
    if (!result.success) {
      setProblems({ error: result.error, details: result.details ?? [] });
      setItems(null);
      return;
    }
    setProblems(null);
    setExtraKeys(result.hadExtraKeys);
    setItems(result.items.map(toPreviewItem));
  };

  const updateItem = (key: number, patch: Partial<PreviewItem>) =>
    setItems((current) => current?.map((item) => (item.key === key ? { ...item, ...patch } : item)) ?? null);

  const saveAll = () => {
    if (!items || items.length === 0) {
      return;
    }
    const inputs: EntryInput[] = [];
    const checked = items.map((item) => {
      const result = parseNutrientFields(item.fields);
      if (!result.ok) {
        return { ...item, errors: result.errors };
      }
      // Auto uses the item's meal type if the AI provided one, otherwise the inferred type (10.1)
      inputs.push({ ...result.value, mealType: batchMealType ?? item.mealType, eatenAt });
      return { ...item, errors: {} };
    });
    if (inputs.length < items.length) {
      setItems(checked);
      return;
    }
    createEntries(db, inputs);
    descriptionDraft = '';
    showSnackbar(inputs.length === 1 ? '1 entry saved' : `${inputs.length} entries saved`);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextInput
        mode="outlined"
        theme={INPUT_THEME}
        label="What did you eat?"
        value={description}
        onChangeText={changeDescription}
        multiline
      />
      <Button mode="contained-tonal" icon="content-copy" onPress={copyPrompt} style={styles.button}>
        Copy prompt
      </Button>

      <TextInput
        mode="outlined"
        theme={INPUT_THEME}
        label="Paste the AI's answer"
        value={answer}
        onChangeText={setAnswer}
        multiline
        numberOfLines={8}
        style={styles.answer}
      />
      <Button mode="contained" onPress={check} disabled={answer.trim() === ''} style={styles.button}>
        Check
      </Button>
      {problems ? (
        <View>
          <HelperText type="error">{problems.error}</HelperText>
          {problems.details.map((detail) => (
            <HelperText key={detail} type="error">
              {detail}
            </HelperText>
          ))}
        </View>
      ) : null}

      {items ? (
        <View>
          {extraKeys ? <HelperText type="info">The answer had extra fields; they were ignored.</HelperText> : null}
          <Text variant="labelLarge" style={styles.label}>
            Eaten at
          </Text>
          <DateTimeChips eatenAt={eatenAt} onChange={setEatenAt} timePicked={timePicked} onTimePicked={() => setTimePicked(true)} />
          <Text variant="labelLarge" style={styles.label}>
            Meal
          </Text>
          <MealTypeChips value={batchMealType} onChange={setBatchMealType} eatenAt={eatenAt} autoLabel="Auto" />
          {items.map((item, index) => (
            <Card key={item.key} style={styles.item}>
              <Card.Title
                title={`Item ${index + 1}`}
                right={() => (
                  <IconButton
                    icon="close"
                    accessibilityLabel="Remove item"
                    onPress={() => setItems(items.filter((other) => other.key !== item.key))}
                  />
                )}
              />
              <Card.Content>
                <NutrientInputs
                  fields={item.fields}
                  errors={item.errors}
                  onChange={(field, value) => updateItem(item.key, { fields: { ...item.fields, [field]: value } })}
                />
              </Card.Content>
            </Card>
          ))}
          <Button mode="contained" onPress={saveAll} disabled={items.length === 0} style={styles.button}>
            Save all
          </Button>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  button: { marginVertical: 12 },
  answer: { minHeight: 140 },
  label: { marginTop: 8, marginBottom: 4 },
  item: { marginBottom: 12 }
});
