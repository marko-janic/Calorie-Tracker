import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { getEntry, setEntryDeleted, updateEntry } from '../../db/entries';
import { nutrientFieldsFrom } from '../../domain/entryForm';
import { formatTimestamp } from '../../domain/time';
import { useDatabase } from '../../ui/DatabaseProvider';
import { EntryForm } from '../../ui/EntryForm';
import { useSnackbar } from '../../ui/SnackbarProvider';

/** Edit an entry, with its details, "Log again" and "Delete" with Undo (9.2). */
export default function EditEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const showSnackbar = useSnackbar();
  const theme = useTheme();
  // The form keeps its own state; a sync while editing does not overwrite the inputs
  const [entry] = useState(() => getEntry(db, id));

  if (!entry || entry.deleted) {
    return (
      <View style={styles.missing}>
        <Text variant="bodyLarge">This entry no longer exists.</Text>
      </View>
    );
  }

  const remove = () => {
    setEntryDeleted(db, entry.id, true);
    showSnackbar('Entry deleted', { label: 'Undo', onPress: () => setEntryDeleted(db, entry.id, false) });
    router.back();
  };

  return (
    <EntryForm
      initial={{ fields: nutrientFieldsFrom(entry), mealType: entry.mealType, eatenAt: entry.eatenAt, timePicked: true }}
      submitLabel="Save"
      onSubmit={(input) => {
        updateEntry(db, entry.id, input);
        router.back();
      }}
    >
      <Text variant="bodySmall" style={styles.details}>
        Logged {formatTimestamp(entry.loggedAt)}
      </Text>
      <View style={styles.actions}>
        <Button icon="repeat" onPress={() => router.push({ pathname: '/entry/new', params: { from: entry.id } })}>
          Log again
        </Button>
        <Button icon="delete" textColor={theme.colors.error} onPress={remove}>
          Delete
        </Button>
      </View>
    </EntryForm>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  details: { marginTop: 16, opacity: 0.7 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }
});
