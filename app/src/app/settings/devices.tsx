import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Card, Dialog, HelperText, IconButton, List, Portal, Text } from 'react-native-paper';

import { formatTimestamp } from '../../domain/time';
import type { DeviceInfo, PairingCodeResponse } from '../../sync/types';
import { useSyncEngine } from '../../ui/SyncProvider';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Devices list (this device marked), revoke with confirmation, "Pair a new device" (7.5, 9.2). */
export default function DevicesScreen() {
  const engine = useSyncEngine();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<DeviceInfo | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCodeResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    engine.listDevices().then(
      (list) => {
        if (active) {
          setDevices(list);
          setError(null);
        }
      },
      (caught: unknown) => active && setError(errorMessage(caught))
    );
    return () => {
      active = false;
    };
  }, [engine, reloads]);

  useEffect(() => {
    if (!pairingCode) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairingCode]);

  const createCode = async () => {
    try {
      setPairingCode(await engine.createPairingCode());
      setNow(Date.now());
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const revoke = async (device: DeviceInfo) => {
    setRevoking(null);
    try {
      await engine.revokeDevice(device.id);
      if (device.isCurrent) {
        router.back();
        return;
      }
      setReloads((count) => count + 1);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const remaining = pairingCode ? Date.parse(pairingCode.expiresAt) - now : 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Card.Title title="Pair a new device" />
        <Card.Content>
          {pairingCode && remaining > 0 ? (
            <>
              <Text variant="displaySmall" selectable style={styles.code}>
                {pairingCode.code}
              </Text>
              <Text variant="bodyMedium">{`Valid for ${formatCountdown(remaining)}. Enter it on the new device.`}</Text>
            </>
          ) : (
            <Text variant="bodyMedium">Creates a one-time code that is valid for 10 minutes.</Text>
          )}
        </Card.Content>
        <Card.Actions>
          <Button onPress={() => void createCode()}>{pairingCode && remaining > 0 ? 'New code' : 'Create code'}</Button>
        </Card.Actions>
      </Card>

      {error ? <HelperText type="error">{error}</HelperText> : null}
      <List.Section>
        <List.Subheader>Paired devices</List.Subheader>
        {devices?.map((device) => (
          <List.Item
            key={device.id}
            title={device.isCurrent ? `${device.name} (this device)` : device.name}
            description={`Paired ${formatTimestamp(device.createdAt)} · last seen ${formatTimestamp(device.lastSeenAt)}`}
            right={() => <IconButton icon="delete" accessibilityLabel={`Remove ${device.name}`} onPress={() => setRevoking(device)} />}
          />
        ))}
      </List.Section>

      <Portal>
        <Dialog visible={revoking !== null} onDismiss={() => setRevoking(null)}>
          <Dialog.Title>{revoking?.isCurrent ? 'Remove this device?' : `Remove ${revoking?.name}?`}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {revoking?.isCurrent
                ? 'This device stops syncing and forgets the server. Local data is kept.'
                : 'The device can no longer sync until it is paired again.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRevoking(null)}>Cancel</Button>
            <Button onPress={() => revoking && void revoke(revoking)}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  card: { marginBottom: 8 },
  code: { letterSpacing: 2, marginBottom: 8 }
});
