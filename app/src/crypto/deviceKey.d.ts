/**
 * The device key interface (7.2), implemented by deviceKey.native.ts (Android) and deviceKey.web.ts (web).
 * Metro picks the platform file; this declaration lets TypeScript resolve `./deviceKey`.
 */

/** Load the device key, creating and storing it on first use. */
export declare function getOrCreateKey(): Promise<void>;

/** The public key as base64 SubjectPublicKeyInfo DER. */
export declare function publicKeySpkiBase64(): Promise<string>;

/** Sign a UTF-8 message with ECDSA P-256/SHA-256; returns the 64-byte r‖s signature as base64. */
export declare function sign(message: string): Promise<string>;

/** Delete the stored device key. */
export declare function deleteKey(): Promise<void>;
