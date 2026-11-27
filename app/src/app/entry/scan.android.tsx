import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { Button, HelperText, IconButton, Text, TextInput, useTheme } from 'react-native-paper';

import { BARCODE_SCANNER_TYPES, toLookupCode } from '../../domain/barcode';
import { INPUT_THEME } from '../../ui/theme';

const TYPED_ERROR = 'Enter the barcode number: 8, 12 or 13 digits with a valid check digit.';

/**
 * Scan a product barcode (9.2): the camera is the first option, the typed number the fallback.
 * A valid code replaces this screen with the "Add entry" screen, which looks the product up.
 */
export default function ScanScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const theme = useTheme();
  const focused = useIsFocused();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const asked = useRef(false);
  // The camera reports the same code many times; only the first one counts
  const opened = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !asked.current) {
      asked.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  // The user may grant the permission in the system settings and come back
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPermission();
      }
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const openProduct = (code: string) => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    router.replace({ pathname: '/entry/new', params: { barcode: code, date } });
  };

  const onScanned = ({ data, type }: BarcodeScanningResult) => {
    const code = toLookupCode(data, type);
    if (code) {
      openProduct(code);
    }
  };

  const lookUpTyped = () => {
    const code = toLookupCode(typed);
    if (code) {
      openProduct(code);
    } else {
      setTypedError(TYPED_ERROR);
    }
  };

  const granted = permission?.granted === true;
  const showCamera = granted && !typing;

  return (
    <View style={[styles.screen, !showCamera && { backgroundColor: theme.colors.background }]}>
      {/* Unmounted while another screen is on top, so only one preview is active */}
      {showCamera && focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_SCANNER_TYPES }}
          onBarcodeScanned={onScanned}
        />
      ) : null}

      {showCamera ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <Text variant="titleMedium" style={styles.hint}>
            Point the camera at the barcode
          </Text>
          <View style={styles.bottom}>
            <IconButton
              mode="contained"
              icon={torch ? 'flashlight' : 'flashlight-off'}
              accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}
              onPress={() => setTorch(!torch)}
            />
            <Button mode="contained-tonal" icon="keyboard" onPress={() => setTyping(true)}>
              Type the number instead
            </Button>
          </View>
        </View>
      ) : null}

      {!showCamera && permission !== null ? (
        <View style={styles.typing}>
          {!granted ? (
            <View style={styles.denied}>
              <Text variant="bodyMedium">The camera is off. Type the number, or allow the camera for Kcal in the system settings.</Text>
              <Button icon="cog" onPress={() => void Linking.openSettings()}>
                Open settings
              </Button>
            </View>
          ) : null}
          <TextInput
            mode="outlined"
            theme={INPUT_THEME}
            label="Barcode number"
            value={typed}
            onChangeText={(value) => {
              setTyped(value);
              setTypedError(null);
            }}
            onSubmitEditing={lookUpTyped}
            keyboardType="number-pad"
            error={typedError !== null}
            autoFocus
          />
          {typedError ? <HelperText type="error">{typedError}</HelperText> : null}
          <Button mode="contained" onPress={lookUpTyped} disabled={typed.trim() === ''} style={styles.lookUp}>
            Look up
          </Button>
          {granted ? (
            <Button icon="barcode-scan" onPress={() => setTyping(false)}>
              Use the camera instead
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'black' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'space-between' },
  hint: { color: 'white', textAlign: 'center', padding: 12, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  bottom: { alignItems: 'center', gap: 12, padding: 16 },
  typing: { flex: 1, padding: 16 },
  denied: { gap: 8, marginBottom: 16 },
  lookUp: { marginTop: 12 }
});
