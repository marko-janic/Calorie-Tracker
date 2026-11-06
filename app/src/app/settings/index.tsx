import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import { Button, Dialog, List, Portal, Text } from 'react-native-paper';

import { syncStateFromRows, syncStateQuery } from '../../db/syncStore';
import { formatTimestamp } from '../../domain/time';
import { offlineReasonText, statusLine } from '../../sync/status';
import { openAppSettings, syncPlatform } from '../../sync/platform';
import { useDatabase } from '../../ui/DatabaseProvider';
import { formatSyncTime } from '../../ui/SyncStatus';
import { useSyncEngine, useSyncSnapshot } from '../../ui/SyncProvider';

const IS_WEB = Platform.OS === 'web';

/** Settings (9.2): server, sync status, devices, disconnect, about and updates. */
export default function SettingsScreen() {
  const db = useDatabase();
  const engine = useSyncEngine();
  const snapshot = useSyncSnapshot();
  const { data: rows } = useLiveQuery(syncStateQuery(db));
  const state = syncStateFromRows(rows);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const paired = state.serverUrl !== null && state.deviceId !== null;
  const { status } = snapshot;
  const apkUrl = `${IS_WEB ? '' : state.serverUrl ?? ''}/download/kcal.apk`;
  const getUpdate = () => (IS_WEB ? window.location.reload() : void Linking.openURL(apkUrl));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <List.Section>
        <List.Subheader>Server</List.Subheader>
        {paired ? (
          <>
            <List.Item title={state.serverUrl} description={`This device: ${state.deviceName ?? ''}`} left={(props) => <List.Icon {...props} icon="server" />} />
            <List.Item
              title={statusLine(snapshot, formatSyncTime) ?? 'Not synced yet'}
              description={
                status.state === 'offline'
                  ? offlineReasonText(status.reason)
                  : status.state === 'error'
                    ? status.message
                    : `${snapshot.waiting} waiting${state.lastSyncAt ? ` · last sync ${formatTimestamp(state.lastSyncAt)}` : ''}`
              }
              left={(props) => <List.Icon {...props} icon="sync" />}
            />
            {status.state === 'offline' && status.reason === 'localNetworkPermission' ? (
              <Button onPress={() => void openAppSettings()}>Open app settings</Button>
            ) : null}
            {status.state === 'needsPairing' ? (
              <Button mode="contained" onPress={() => router.push('/settings/connect')} style={styles.button}>
                Pair again
              </Button>
            ) : null}
            <Button mode="contained-tonal" icon="sync" onPress={() => void engine.requestSync()} style={styles.button}>
              Sync now
            </Button>
            <Button icon="cellphone-link" onPress={() => router.push('/settings/devices')} style={styles.button}>
              Devices
            </Button>
            <Button icon="link-off" onPress={() => setConfirmDisconnect(true)} style={styles.button}>
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <Text variant="bodyMedium" style={styles.text}>
              No server configured. Kcal works fully offline; connect to a server to sync your devices.
            </Text>
            <Text variant="bodySmall" style={styles.text}>
              {`${snapshot.waiting} local changes`}
            </Text>
            <Button mode="contained" onPress={() => router.push('/settings/connect')} style={styles.button}>
              Connect
            </Button>
          </>
        )}
      </List.Section>

      <List.Section>
        <List.Subheader>About</List.Subheader>
        <List.Item title="App version" description={syncPlatform.appVersion} />
        {snapshot.serverVersion ? <List.Item title="Server version" description={snapshot.serverVersion} /> : null}
        {status.state === 'updateRequired' ? (
          <Button mode="contained" onPress={getUpdate} style={styles.button}>
            {IS_WEB ? 'Update required – Reload' : 'Update required – Download'}
          </Button>
        ) : snapshot.updateAvailable ? (
          <Button mode="contained-tonal" onPress={getUpdate} style={styles.button}>
            {IS_WEB ? 'New version – Reload' : `Update available (v${snapshot.serverVersion}) – Download`}
          </Button>
        ) : null}
        {IS_WEB ? (
          <Button icon="android" onPress={() => void Linking.openURL(apkUrl)} style={styles.button}>
            Get the Android app
          </Button>
        ) : null}
      </List.Section>

      <Portal>
        <Dialog visible={confirmDisconnect} onDismiss={() => setConfirmDisconnect(false)}>
          <Dialog.Title>Disconnect from the server?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              This device forgets the server and its key. Local data is kept; changes that are not synced yet stay on this device.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDisconnect(false)}>Cancel</Button>
            <Button
              onPress={() => {
                setConfirmDisconnect(false);
                void engine.disconnect();
              }}
            >
              Disconnect
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  text: { paddingHorizontal: 16, marginBottom: 8 },
  button: { marginHorizontal: 16, marginVertical: 4 }
});
