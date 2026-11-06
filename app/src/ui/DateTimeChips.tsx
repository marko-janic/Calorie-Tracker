import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';

import { EARLIEST_EATEN_DATE, latestEatenDate } from '../domain/entryForm';
import {
  changeEatenDate,
  changeEatenTime,
  formatDayTitle,
  formatLocalDate,
  formatTimeOfDay,
  getEatenLocalDate,
  getEatenTime,
  getTodayLocalDate,
  parseLocalDate
} from '../domain/time';

interface DateTimeChipsProps {
  eatenAt: string;
  onChange: (eatenAt: string) => void;
  /** Whether a time was picked; otherwise the time chip says "now". */
  timePicked: boolean;
  onTimePicked: () => void;
}

/**
 * "Eaten at": a date chip ("Today") and an optional time chip ("now") (5.2).
 * Changing only the day keeps the time of day.
 */
export function DateTimeChips({ eatenAt, onChange, timePicked, onTimePicked }: DateTimeChipsProps) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const today = getTodayLocalDate();
  const localDate = getEatenLocalDate(eatenAt);
  const { hours, minutes } = getEatenTime(eatenAt);

  return (
    <View style={styles.row}>
      <Chip icon="calendar" onPress={() => setPicker('date')} style={styles.chip}>
        {formatDayTitle(localDate, today)}
      </Chip>
      <Chip icon="clock-outline" onPress={() => setPicker('time')} style={styles.chip}>
        {timePicked ? formatTimeOfDay(hours, minutes) : 'now'}
      </Chip>
      <DatePickerModal
        locale="en"
        mode="single"
        visible={picker === 'date'}
        date={parseLocalDate(localDate)}
        validRange={{ startDate: parseLocalDate(EARLIEST_EATEN_DATE), endDate: parseLocalDate(latestEatenDate(today)) }}
        onDismiss={() => setPicker(null)}
        onConfirm={({ date }) => {
          setPicker(null);
          if (date) {
            onChange(changeEatenDate(eatenAt, formatLocalDate(date)));
          }
        }}
      />
      <TimePickerModal
        locale="en"
        visible={picker === 'time'}
        hours={hours}
        minutes={minutes}
        onDismiss={() => setPicker(null)}
        onConfirm={(time) => {
          setPicker(null);
          onTimePicked();
          onChange(changeEatenTime(eatenAt, time.hours, time.minutes));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: { marginRight: 8, marginBottom: 4 }
});
