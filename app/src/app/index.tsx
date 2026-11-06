import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, IconButton, List, Text, useTheme } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';

import { entriesOfDayQuery } from '../db/entries';
import { profileFromRow } from '../db/mappers';
import { profileQuery } from '../db/profile';
import { groupByMeal, MEAL_GROUP_LABELS } from '../domain/mealInference';
import { addDays, formatDayTitle, formatLocalDate, getTodayLocalDate, isLocalDate, parseLocalDate } from '../domain/time';
import { calculateTotals, formatKcal } from '../domain/totals';
import { skippedDeletionsText } from '../sync/status';
import { useDatabase } from '../ui/DatabaseProvider';
import { EntryRow } from '../ui/EntryRow';
import { NutrientBar } from '../ui/NutrientBar';
import { useSnackbar } from '../ui/SnackbarProvider';
import { SyncBanner, SyncStatusLine } from '../ui/SyncStatus';
import { useSyncEngine, useSyncSnapshot } from '../ui/SyncProvider';

/** Day view (9.2): ?date=YYYY-MM-DD, default today. */
export default function DayView() {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = getTodayLocalDate();
  const date = params.date && isLocalDate(params.date) ? params.date : today;

  const db = useDatabase();
  const { data: rows } = useLiveQuery(entriesOfDayQuery(db, date), [date]);
  const { data: profileRows } = useLiveQuery(profileQuery(db));
  const targets = profileRows[0] ? profileFromRow(profileRows[0]).targets : null;

  const engine = useSyncEngine();
  const snapshot = useSyncSnapshot();
  const showSnackbar = useSnackbar();
  const [refreshing, setRefreshing] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (snapshot.skippedDeletions > 0) {
      showSnackbar(skippedDeletionsText(snapshot.skippedDeletions));
      engine.acknowledgeSkippedDeletions();
    }
  }, [engine, showSnackbar, snapshot.skippedDeletions]);

  const goTo = (localDate: string) => router.setParams({ date: localDate === today ? undefined : localDate });
  const totals = calculateTotals(rows);
  const groups = groupByMeal(rows);

  const syncNow = async () => {
    setRefreshing(true);
    await engine.requestSync();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: 'Kcal',
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton icon="target" accessibilityLabel="Targets" onPress={() => router.push('/targets')} />
              <IconButton icon="cog" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
            </View>
          )
        }}
      />
      <SyncBanner />
      <View style={styles.dayHeader}>
        <IconButton icon="chevron-left" accessibilityLabel="Previous day" onPress={() => goTo(addDays(date, -1))} />
        <Button onPress={() => setPickingDate(true)} labelStyle={styles.dayTitle}>
          {formatDayTitle(date, today)}
        </Button>
        <IconButton icon="chevron-right" accessibilityLabel="Next day" onPress={() => goTo(addDays(date, 1))} />
      </View>
      <SyncStatusLine />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={syncNow} />}
      >
        <Card style={styles.summary}>
          <Card.Content>
            <NutrientBar label="Energy" unit="kcal" total={{ value: totals.kcal, unknownCount: 0 }} target={targets?.kcal ?? null} />
            <NutrientBar label="Protein" unit="g" total={totals.protein} target={targets?.proteinG ?? null} />
            <NutrientBar label="Carbs" unit="g" total={totals.carbs} target={targets?.carbsG ?? null} />
            <NutrientBar label="Fat" unit="g" total={totals.fat} target={targets?.fatG ?? null} />
            <NutrientBar label="Fibre" unit="g" total={totals.fibre} target={targets?.fibreG ?? null} />
            {targets === null ? (
              <Button mode="text" onPress={() => router.push('/targets')}>
                Set targets
              </Button>
            ) : null}
          </Card.Content>
        </Card>
        {groups.length === 0 ? (
          <Text style={styles.empty} variant="bodyMedium">
            Nothing logged on this day.
          </Text>
        ) : null}
        {groups.map((group) => (
          <List.Section key={group.mealType}>
            <List.Subheader>{`${MEAL_GROUP_LABELS[group.mealType]} · ${formatKcal(group.kcal)} kcal`}</List.Subheader>
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onPress={() => router.push(`/entry/${entry.id}`)} />
            ))}
          </List.Section>
        ))}
      </ScrollView>
      <DatePickerModal
        locale="en"
        mode="single"
        visible={pickingDate}
        date={parseLocalDate(date)}
        onDismiss={() => setPickingDate(false)}
        onConfirm={({ date: picked }) => {
          setPickingDate(false);
          if (picked) {
            goTo(formatLocalDate(picked));
          }
        }}
      />
      <View style={[styles.actions, { backgroundColor: theme.colors.background }]}>
        <Button
          mode="contained"
          icon="plus"
          style={styles.action}
          onPress={() => router.push({ pathname: '/entry/new', params: { date } })}
        >
          Add entry
        </Button>
        <Button
          mode="contained-tonal"
          icon="robot-outline"
          style={styles.action}
          onPress={() => router.push({ pathname: '/import', params: { date } })}
        >
          AI import
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerActions: { flexDirection: 'row' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  dayTitle: { fontSize: 18 },
  content: { paddingBottom: 16 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  action: { flex: 1 },
  summary: { marginHorizontal: 16, marginVertical: 8 },
  empty: { textAlign: 'center', marginTop: 24, opacity: 0.7 }
});
