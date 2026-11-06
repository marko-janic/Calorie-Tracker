import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { INPUT_THEME } from './theme';

interface NumberFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  /** Unit shown inside the field, e.g. "g". */
  suffix?: string;
  integer?: boolean;
}

/** A number input. Parsing accepts "," and "." as the decimal separator and ignores spaces (5.4). */
export function NumberField({ label, value, onChangeText, error, suffix, integer }: NumberFieldProps) {
  return (
    <View style={styles.field}>
      <TextInput
        mode="outlined"
        theme={INPUT_THEME}
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        error={error !== undefined}
        right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
        dense
      />
      {error ? <HelperText type="error">{error}</HelperText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 8 }
});
