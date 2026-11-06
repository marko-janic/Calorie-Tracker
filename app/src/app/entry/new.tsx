import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { createEntry, getEntry } from '../../db/entries';
import { EMPTY_NUTRIENT_FIELDS, nutrientFieldsFrom } from '../../domain/entryForm';
import { changeEatenDate, getNowLocal, getTodayLocalDate, isLocalDate } from '../../domain/time';
import { useDatabase } from '../../ui/DatabaseProvider';
import { EntryForm, EntryFormValues } from '../../ui/EntryForm';

/**
 * Add an entry (9.2). ?from=<id> is "log again": name, nutrients, quantity, explicit meal type
 * and notes are copied, eatenAt is now. ?date=YYYY-MM-DD presets the day (from the day view).
 */
export default function NewEntry() {
  const { from, date } = useLocalSearchParams<{ from?: string; date?: string }>();
  const db = useDatabase();

  const [initial] = useState((): EntryFormValues => {
    const source = from ? getEntry(db, from) : undefined;
    const now = getNowLocal();
    const eatenAt = date && isLocalDate(date) && date !== getTodayLocalDate() ? changeEatenDate(now, date) : now;
    return {
      fields: source ? nutrientFieldsFrom(source) : EMPTY_NUTRIENT_FIELDS,
      mealType: source?.mealType ?? null,
      eatenAt,
      timePicked: false
    };
  });

  return (
    <>
      <Stack.Screen options={{ title: from ? 'Log again' : 'Add entry' }} />
      <EntryForm
        initial={initial}
        submitLabel="Save"
        onSubmit={(input) => {
          createEntry(db, input);
          router.back();
        }}
      />
    </>
  );
}
