/** Sync platform specifics on Android (7.1, 9.4, 9.7). */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Linking, PermissionsAndroid, Permission, Platform } from 'react-native';

import type { SyncPlatform } from './engine';

/** The targetSdkVersion of the Expo SDK 58 template. Raise together with the template (9.4). */
const TARGET_SDK_VERSION = 36;

/** Android 17 (API 37) protects LAN connections with a runtime permission. */
const LOCAL_NETWORK_API_LEVEL = 37;

const LOCAL_NETWORK_PERMISSION = 'android.permission.ACCESS_LOCAL_NETWORK' as Permission;

function needsLocalNetworkPermission(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version >= LOCAL_NETWORK_API_LEVEL &&
    TARGET_SDK_VERSION >= LOCAL_NETWORK_API_LEVEL
  );
}

export const syncPlatform: SyncPlatform = {
  appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  allowHttp: __DEV__,
  async isLocalNetworkPermissionDenied() {
    return needsLocalNetworkPermission() && !(await PermissionsAndroid.check(LOCAL_NETWORK_PERMISSION));
  },
  async onPaired() {}
};

export const HAS_FIXED_SERVER_URL = false;

export function defaultServerUrl(): string {
  return '';
}

export function defaultDeviceName(): string {
  return Device.modelName ?? 'Android phone';
}

export async function requestLocalNetworkPermission(): Promise<boolean> {
  if (!needsLocalNetworkPermission()) {
    return true;
  }
  return (await PermissionsAndroid.request(LOCAL_NETWORK_PERMISSION)) === PermissionsAndroid.RESULTS.GRANTED;
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
