import { router } from 'expo-router';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Banner, Text, TouchableRipple } from 'react-native-paper';

import { formatTimeOfDay } from '../domain/time';
import { needsPairingText, offlineReasonText, statusLine } from '../sync/status';
import { useSyncSnapshot } from './SyncProvider';

/** Local time of a UTC timestamp, e.g. "10:42". */
export function formatSyncTime(utc: string): string {
  const date = new Date(utc);
  return formatTimeOfDay(date.getHours(), date.getMinutes());
}

/** The small sync status line of the day view (6.6). Tapping it opens Settings. */
export function SyncStatusLine() {
  const snapshot = useSyncSnapshot();
  const { status } = snapshot;
  const line = statusLine(snapshot, formatSyncTime);
  if (line === null || status.state === 'needsPairing' || status.state === 'updateRequired') {
    // Those two are shown prominently by SyncBanner
    return null;
  }
  return (
    <TouchableRipple onPress={() => router.push('/settings')} accessibilityRole="button">
      <View style={styles.line}>
        <Text variant="bodySmall" style={status.state === 'error' ? styles.error : undefined}>
          {line}
        </Text>
        {status.state === 'offline' ? (
          <Text variant="labelSmall" style={styles.reason}>
            {offlineReasonText(status.reason)}
          </Text>
        ) : null}
      </View>
    </TouchableRipple>
  );
}

/** Prominent banners for "pair again" and "update required" (6.6, 9.7). */
export function SyncBanner() {
  const { status, serverUrl } = useSyncSnapshot();
  if (status.state === 'needsPairing') {
    return (
      <Banner visible actions={[{ label: 'Pair again', onPress: () => router.push('/settings/connect') }]}>
        {needsPairingText(status.reason)}
      </Banner>
    );
  }
  if (status.state === 'updateRequired') {
    return (
      <Banner
        visible
        actions={[
          Platform.OS === 'web'
            ? { label: 'Reload', onPress: () => window.location.reload() }
            : { label: 'Download', onPress: () => void Linking.openURL(`${serverUrl ?? ''}/download/kcal.apk`) }
        ]}
      >
        Update required to sync. Local use continues.
      </Banner>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  line: { paddingHorizontal: 16, paddingVertical: 4 },
  reason: { opacity: 0.7 },
  error: { fontWeight: 'bold' }
});
