import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Banner, Button, Text } from 'react-native-paper';

import { createEntry, getEntry } from '../../db/entries';
import { EMPTY_NUTRIENT_FIELDS, nutrientFieldsFrom } from '../../domain/entryForm';
import { hasProductData, type Per100, productPer100, productToFormValues } from '../../domain/product';
import { changeEatenDate, getNowLocal, getTodayLocalDate, isLocalDate } from '../../domain/time';
import { lookupBarcode, type LookupResult } from '../../products/lookup';
import { useDatabase } from '../../ui/DatabaseProvider';
import { EntryForm, EntryFormValues } from '../../ui/EntryForm';

/** The state of the product lookup of a scanned barcode; `manual` means the user skipped it. */
type Lookup = { status: 'loading' } | { status: 'manual' } | LookupResult;

/** The chosen day with the current time of day. */
function initialEatenAt(date: string | undefined): string {
  const now = getNowLocal();
  return date && isLocalDate(date) && date !== getTodayLocalDate() ? changeEatenDate(now, date) : now;
}

/**
 * Add an entry (9.2). ?from=<id> is "log again": name, nutrients, quantity, explicit meal type
 * and notes are copied, eatenAt is now. ?date=YYYY-MM-DD presets the day (from the day view).
 * ?barcode=<code> (from the scan screen) looks the product up first and prefills the form.
 */
export default function NewEntry() {
  const { from, date, barcode } = useLocalSearchParams<{ from?: string; date?: string; barcode?: string }>();
  // A retry remounts the lookup, so it starts from scratch
  const [attempt, setAttempt] = useState(0);

  return (
    <>
      <Stack.Screen options={{ title: from ? 'Log again' : 'Add entry' }} />
      {barcode ? (
        <ScannedEntry
          key={`${barcode}:${attempt}`}
          barcode={barcode}
          date={date}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      ) : (
        <ManualEntry from={from} date={date} />
      )}
    </>
  );
}

function ManualEntry({ from, date }: { from?: string; date?: string }) {
  const db = useDatabase();

  const [initial] = useState((): EntryFormValues => {
    const source = from ? getEntry(db, from) : undefined;
    return {
      fields: source ? nutrientFieldsFrom(source) : EMPTY_NUTRIENT_FIELDS,
      mealType: source?.mealType ?? null,
      eatenAt: initialEatenAt(date),
      timePicked: false
    };
  });

  return <NewEntryForm initial={initial} />;
}

function NewEntryForm({ initial, per100 }: { initial: EntryFormValues; per100?: Per100 }) {
  const db = useDatabase();

  return (
    <EntryForm
      initial={initial}
      per100={per100}
      submitLabel="Save"
      onSubmit={(input) => {
        createEntry(db, input);
        router.back();
      }}
    />
  );
}

interface ScannedEntryProps {
  barcode: string;
  date?: string;
  onRetry: () => void;
}

/**
 * Looks the barcode up before the form is shown, because the form reads its starting values once.
 * Whatever the outcome, the user ends up in an editable form and nothing is saved by itself.
 */
function ScannedEntry({ barcode, date, onRetry }: ScannedEntryProps) {
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [eatenAt] = useState(() => initialEatenAt(date));
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void lookupBarcode(barcode, abort.signal).then((result) => {
      if (!abort.signal.aborted) {
        setLookup(result);
      }
    });
    return () => abort.abort();
  }, [barcode]);

  const fillManually = () => {
    controller.current?.abort();
    setLookup({ status: 'manual' });
  };

  if (lookup.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text variant="titleMedium">Looking up the product</Text>
        <Text variant="bodyLarge" selectable>
          {barcode}
        </Text>
        <Button mode="outlined" onPress={fillManually} style={styles.loadingButton}>
          Fill in manually
        </Button>
      </View>
    );
  }

  const empty: EntryFormValues = { fields: EMPTY_NUTRIENT_FIELDS, mealType: null, eatenAt, timePicked: false };

  if (lookup.status === 'found' && hasProductData(lookup.product)) {
    const per100 = productPer100(lookup.product);
    const values = productToFormValues(lookup.product);
    return (
      <View style={styles.screen}>
        <Banner visible icon="barcode">
          {`Filled in from Open Food Facts (per 100 ${per100.unit}). Check the values before saving. US labels count fibre inside carbs.`}
        </Banner>
        <NewEntryForm
          initial={{ ...empty, fields: nutrientFieldsFrom({ ...values, quantity: 1, notes: null }) }}
          per100={per100}
        />
      </View>
    );
  }

  const notice = lookupNotice(lookup, barcode);
  return (
    <View style={styles.screen}>
      {notice ? (
        <Banner
          visible
          icon="alert-circle-outline"
          actions={lookup.status === 'offline' || lookup.status === 'error' ? [{ label: 'Retry', onPress: onRetry }] : []}
        >
          {notice}
        </Banner>
      ) : null}
      <NewEntryForm initial={empty} />
    </View>
  );
}

/** What to tell the user when there is nothing to prefill; the barcode stays in the text. */
function lookupNotice(lookup: Exclude<Lookup, { status: 'loading' }>, barcode: string): string | null {
  switch (lookup.status) {
    case 'notFound':
      return `Product not found (${barcode}). Fill it in manually.`;
    case 'found':
      // OFF knows the barcode but has no name and no nutrients for it
      return `Open Food Facts has no data for ${barcode}. Fill it in manually.`;
    case 'offline':
      return `Could not look up ${barcode}: Open Food Facts is not reachable. Fill it in manually or retry.`;
    case 'error':
      return `Could not look up ${barcode}. ${lookup.message} Fill it in manually or retry.`;
    case 'manual':
      return null;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  loadingButton: { marginTop: 12 }
});
