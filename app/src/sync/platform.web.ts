/** Sync platform specifics on the web (9.5, 9.7). */
import Constants from 'expo-constants';

import type { SyncPlatform } from './engine';

export const syncPlatform: SyncPlatform = {
  // A build-time constant from /VERSION (app.config.ts)
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  // The server is always the page's own origin (9.5): the page already came from it, and
  // expo-sqlite needs a secure context anyway (HTTPS, or http://localhost when run locally).
  allowHttp: true,
  async isLocalNetworkPermissionDenied() {
    return false;
  },
  async onPaired() {
    // Reduces the risk of the browser evicting the local database
    await navigator.storage?.persist?.();
  }
};

export const HAS_FIXED_SERVER_URL = true;

export function defaultServerUrl(): string {
  return window.location.origin;
}

export function defaultDeviceName(): string {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform
    || 'the web';
  return `Browser on ${platform}`;
}

export async function requestLocalNetworkPermission(): Promise<boolean> {
  return true;
}

export async function openAppSettings(): Promise<void> {}
