/** Version checks against the server (9.7). */
import type { UpdateRequiredReason } from './status';
import type { HealthResponse } from './types';

export const SUPPORTED_API_VERSION = 2;

/** Compares two MAJOR.MINOR.PATCH versions; returns a negative number, 0 or a positive number. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => version.split('.').map((part) => parseInt(part, 10) || 0);
  const [left, right] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * Why sync pauses, or null if app and server fit together. The server is the older side if it speaks
 * a lower API version than the app (a server rollback, or an old server); the app is the older side
 * if the server speaks a higher API version or requires a newer app.
 */
export function updateRequiredReason(health: HealthResponse, appVersion: string): UpdateRequiredReason | null {
  if (health.apiVersion < SUPPORTED_API_VERSION) {
    return 'server';
  }
  if (health.apiVersion > SUPPORTED_API_VERSION || compareVersions(appVersion, health.minAppVersion) < 0) {
    return 'app';
  }
  return null;
}

/** A newer server version means a newer app is available (the APK is bundled with the server). */
export function isUpdateAvailable(health: HealthResponse, appVersion: string): boolean {
  return compareVersions(health.serverVersion, appVersion) > 0;
}
