/**
 * Platform specifics of sync, implemented by platform.native.ts (Android) and platform.web.ts.
 * Metro picks the platform file; this declaration lets TypeScript resolve `./platform`.
 */
import type { SyncPlatform } from './engine';

export declare const syncPlatform: SyncPlatform;

/** Whether the connect screen asks for a server URL (Android) or uses its own origin (web). */
export declare const HAS_FIXED_SERVER_URL: boolean;

/** The server URL to prefill: empty on Android, window.location.origin on the web (9.5). */
export declare function defaultServerUrl(): string;

/** The default device name: the model name on Android, "Browser on <platform>" on the web (7.3). */
export declare function defaultDeviceName(): string;

/**
 * Requests the Android local network permission where needed (9.4).
 * Returns false only if it is needed and was denied.
 */
export declare function requestLocalNetworkPermission(): Promise<boolean>;

/** Opens the app's system settings (to grant a denied permission). */
export declare function openAppSettings(): Promise<void>;
