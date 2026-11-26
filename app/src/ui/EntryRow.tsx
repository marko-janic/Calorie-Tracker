import { List, Text } from 'react-native-paper';

import { formatEntryAmount, formatEntryKcal, formatMacroLine, formatNumber } from '../domain/totals';
import type { Entry } from '../domain/types';

/**
 * A row of the day view: name, "×q" when the quantity is not 1, the total amount when the entry has a
 * portion size, kcal × quantity and a macro line (9.2).
 */
export function EntryRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const quantity = entry.quantity !== 1 ? ` ×${formatNumber(entry.quantity, 2)}` : '';
  const amount = formatEntryAmount(entry);
  const macros = formatMacroLine(entry);
  return (
    <List.Item
      title={`${entry.name}${quantity}${amount ? ` · ${amount}` : ''}`}
      description={macros || undefined}
      onPress={onPress}
      right={() => <Text variant="bodyLarge">{formatEntryKcal(entry)}</Text>}
    />
  );
}
