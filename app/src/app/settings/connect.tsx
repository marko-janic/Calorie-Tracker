import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { ApiError, NetworkError } from '../../sync/api';
import {
  defaultDeviceName,
  defaultServerUrl,
  HAS_FIXED_SERVER_URL,
  openAppSettings,
  requestLocalNetworkPermission
} from '../../sync/platform';
import { useSyncEngine } from '../../ui/SyncProvider';
import { INPUT_THEME } from '../../ui/theme';

function errorText(error: unknown): string {
  if (error instanceof NetworkError) {
    return error.reason === 'timeout'
      ? 'The server did not answer. Are you at home or on the VPN?'
      : 'The server could not be reached (network or certificate error).';
  }
  if (error instanceof ApiError && error.code === 'invalid_pairing_code') {
    return 'Code invalid or expired';
  }
  return error instanceof Error ? error.message : String(error);
}

/** Server URL → health check → pairing code and device name (7.3, 9.2). */
export default function ConnectScreen() {
  const engine = useSyncEngine();
  const [url, setUrl] = useState(defaultServerUrl);
  const [checkedUrl, setCheckedUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = async (serverUrl: string) => {
    setBusy(true);
    setError(null);
    try {
      // Android 17 needs the local network permission to reach the LAN address (9.4)
      const granted = await requestLocalNetworkPermission();
      setPermissionDenied(!granted);
      if (!granted) {
        setError('Local network permission missing');
        return;
      }
      await engine.checkServer(serverUrl);
      setCheckedUrl(serverUrl);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // The web UI always syncs with its own origin (9.5), so it is checked right away
    if (!HAS_FIXED_SERVER_URL) {
      return;
    }
    let active = true;
    const origin = defaultServerUrl();
    engine.checkServer(origin).then(
      () => active && setCheckedUrl(origin),
      (caught: unknown) => active && setError(errorText(caught))
    );
    return () => {
      active = false;
    };
  }, [engine]);

  const pair = async () => {
    if (!checkedUrl) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await engine.pair(checkedUrl, code, deviceName);
      router.back();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {HAS_FIXED_SERVER_URL ? (
        <Text variant="bodyMedium" style={styles.text}>{`Server: ${url}`}</Text>
      ) : (
        <>
          <TextInput
            mode="outlined"
            theme={INPUT_THEME}
            label="Server URL"
            placeholder="https://kcal.example.com"
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setCheckedUrl(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Button mode="contained" onPress={() => void connect(url)} loading={busy && !checkedUrl} disabled={busy} style={styles.button}>
            Connect
          </Button>
        </>
      )}

      {checkedUrl ? (
        <>
          <Text variant="bodyMedium" style={styles.text}>
            Enter a pairing code. Create one on a paired device under Settings → Devices, or on the server with
            “docker compose exec kcal-server kcal pair”.
          </Text>
          <TextInput
            mode="outlined"
            theme={INPUT_THEME}
            label="Pairing code"
            placeholder="XXXX-XXXX"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TextInput
            mode="outlined"
            theme={INPUT_THEME}
            label="Device name"
            value={deviceName}
            onChangeText={setDeviceName}
            style={styles.field}
          />
          <Button
            mode="contained"
            onPress={() => void pair()}
            loading={busy}
            disabled={busy || code.trim() === '' || deviceName.trim() === ''}
            style={styles.button}
          >
            Pair
          </Button>
        </>
      ) : null}

      {error ? <HelperText type="error">{error}</HelperText> : null}
      {permissionDenied ? <Button onPress={() => void openAppSettings()}>Open app settings</Button> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  text: { marginVertical: 8 },
  field: { marginTop: 8 },
  button: { marginTop: 12 }
});
