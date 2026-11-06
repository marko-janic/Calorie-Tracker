/**
 * Sync triggers (6.6): app start, return to the foreground, 2 s after the last local change,
 * network reconnect, every 60 s in the foreground. Pull-to-refresh and "Sync now" call the engine directly.
 */
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';

import { onLocalChange } from '../db/changes';
import type { SyncEngine } from './engine';

export const FOREGROUND_INTERVAL_MS = 60_000;

type Triggerable = Pick<SyncEngine, 'requestSync' | 'notifyLocalChange'>;

export function startSyncTriggers(engine: Triggerable): () => void {
  const sync = () => void engine.requestSync();
  const isForeground = () =>
    Platform.OS === 'web' ? document.visibilityState === 'visible' : AppState.currentState === 'active';

  const stopForeground = onForeground(sync);
  const stopLocalChanges = onLocalChange(() => engine.notifyLocalChange());

  let wasConnected: boolean | null = null;
  const stopNetInfo = NetInfo.addEventListener((state) => {
    const connected = state.isConnected === true;
    if (wasConnected === false && connected) {
      sync();
    }
    wasConnected = connected;
  });

  const interval = setInterval(() => {
    if (isForeground()) {
      sync();
    }
  }, FOREGROUND_INTERVAL_MS);

  sync(); // app start

  return () => {
    stopForeground();
    stopLocalChanges();
    stopNetInfo();
    clearInterval(interval);
  };
}

function onForeground(listener: () => void): () => void {
  if (Platform.OS === 'web') {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        listener();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      listener();
    }
  });
  return () => subscription.remove();
}
