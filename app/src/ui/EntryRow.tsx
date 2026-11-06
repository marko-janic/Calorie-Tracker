import { List, Text } from 'react-native-paper';

import { formatEntryKcal, formatMacroLine, formatNumber } from '../domain/totals';
import type { Entry } from '../domain/types';

/** A row of the day view: name, "×q" when the quantity is not 1, kcal × quantity and a macro line (9.2). */
export function EntryRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const quantity = entry.quantity !== 1 ? ` ×${formatNumber(entry.quantity, 2)}` : '';
  const macros = formatMacroLine(entry);
  return (
    <List.Item
      title={`${entry.name}${quantity}`}
      description={macros || undefined}
      onPress={onPress}
      right={() => <Text variant="bodyLarge">{formatEntryKcal(entry)}</Text>}
    />
  );
}
