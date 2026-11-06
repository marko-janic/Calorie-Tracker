/**
 * Pure helpers for device keys, signed messages and pairing codes (sections 7.2–7.4).
 * Shared by the native and the web device key implementations and the sync engine.
 */

import { hexToBytes } from '@noble/hashes/utils.js';

/** DER prefix of a P-256 SubjectPublicKeyInfo, followed by the 65-byte uncompressed point. */
export const P256_SPKI_PREFIX_HEX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

const UNCOMPRESSED_POINT_LENGTH = 65;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Build the SPKI DER encoding of a P-256 public key from its uncompressed point (0x04 ‖ x ‖ y).
 */
export function p256SpkiFromUncompressedPoint(point: Uint8Array): Uint8Array {
  if (point.length !== UNCOMPRESSED_POINT_LENGTH || point[0] !== 0x04) {
    throw new Error('Expected an uncompressed P-256 point');
  }
  const prefix = hexToBytes(P256_SPKI_PREFIX_HEX);
  const spki = new Uint8Array(prefix.length + point.length);
  spki.set(prefix);
  spki.set(point, prefix.length);
  return spki;
}

/** The message a device signs when pairing (7.3). */
export function pairingMessage(serverId: string, normalizedCode: string, publicKey: string): string {
  return `kcal-pair-v1\n${serverId}\n${normalizedCode}\n${publicKey}`;
}

/** The message a device signs to obtain an access token (7.4). */
export function authMessage(serverId: string, deviceId: string, nonce: string): string {
  return `kcal-auth-v1\n${serverId}\n${deviceId}\n${nonce}`;
}

const PAIRING_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/; // Crockford base32: no I, L, O, U

/**
 * Normalize a typed pairing code: uppercase, remove '-' and spaces, map O→0 and I/L→1.
 */
export function normalizePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[-\s]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Whether a normalized pairing code has the right format (8 Crockford base32 characters). */
export function isValidPairingCode(normalizedCode: string): boolean {
  return PAIRING_CODE_PATTERN.test(normalizedCode);
}

/** Format a normalized pairing code for display and for the pairing request, e.g. "7K2M-QX9D". */
export function formatPairingCode(normalizedCode: string): string {
  return `${normalizedCode.substring(0, 4)}-${normalizedCode.substring(4)}`;
}
