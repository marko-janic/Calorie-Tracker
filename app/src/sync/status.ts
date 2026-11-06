/** Sync status (6.6) and its texts. */

export type OfflineReason = 'timeout' | 'network' | 'localNetworkPermission';

export type NeedsPairingReason = 'deviceRemoved' | 'serverChanged';

export type SyncStatus =
  | { state: 'disabled' }
  | { state: 'syncing' }
  | { state: 'idle' }
  | { state: 'offline'; reason: OfflineReason }
  | { state: 'needsPairing'; reason: NeedsPairingReason }
  | { state: 'updateRequired' }
  | { state: 'error'; message: string };

export interface SyncSnapshot {
  status: SyncStatus;
  /** The paired server, e.g. for the APK download link (9.7). */
  serverUrl: string | null;
  /** Local changes not pushed yet. */
  waiting: number;
  lastSyncAt: string | null;
  serverVersion: string | null;
  updateAvailable: boolean;
  /** Deletions rejected by the server in the latest run (6.5); shown once as a snackbar. */
  skippedDeletions: number;
}

export const INITIAL_SNAPSHOT: SyncSnapshot = {
  status: { state: 'disabled' },
  serverUrl: null,
  waiting: 0,
  lastSyncAt: null,
  serverVersion: null,
  updateAvailable: false,
  skippedDeletions: 0
};

const OFFLINE_REASONS: Record<OfflineReason, string> = {
  timeout: 'Timeout',
  network: 'Network or certificate error',
  localNetworkPermission: 'Local network permission missing'
};

/** The small status line on the day view; null means no line. */
export function statusLine(snapshot: SyncSnapshot, formatTime: (utc: string) => string): string | null {
  const { status } = snapshot;
  switch (status.state) {
    case 'disabled':
      return null;
    case 'syncing':
      return 'Syncing…';
    case 'idle':
      return snapshot.lastSyncAt ? `Synced ${formatTime(snapshot.lastSyncAt)}` : 'Synced';
    case 'offline':
      return `Not connected · ${snapshot.waiting} waiting`;
    case 'needsPairing':
      return needsPairingText(status.reason);
    case 'updateRequired':
      return 'Update required to sync';
    case 'error':
      return 'Sync error';
  }
}

/** The reason in small print below the offline line. */
export function offlineReasonText(reason: OfflineReason): string {
  return OFFLINE_REASONS[reason];
}

export function needsPairingText(reason: NeedsPairingReason): string {
  return reason === 'deviceRemoved' ? 'This device was removed – pair again' : 'Server was reset – pair again';
}

export function skippedDeletionsText(count: number): string {
  return count === 1
    ? '1 deletion skipped – the entry was changed on another device'
    : `${count} deletions skipped – the entries were changed on another device`;
}
