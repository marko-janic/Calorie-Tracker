/**
 * Device key on Android (7.2): ECDSA P-256 with @noble/curves.
 * The 32-byte private key is stored in expo-secure-store (Android Keystore-backed).
 * crypto.getRandomValues is polyfilled by react-native-get-random-values in the root layout.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import * as SecureStore from 'expo-secure-store';

import { bytesToBase64, p256SpkiFromUncompressedPoint } from './protocol';

const STORE_KEY = 'kcal.deviceKey.v1';

let privateKey: Uint8Array | null = null;

/** Load the device key, creating and storing it on first use. */
export async function getOrCreateKey(): Promise<void> {
  await loadKey();
}

async function loadKey(): Promise<Uint8Array> {
  if (privateKey) {
    return privateKey;
  }
  const stored = await SecureStore.getItemAsync(STORE_KEY);
  if (stored) {
    privateKey = hexToBytes(stored);
  } else {
    const created = p256.utils.randomSecretKey();
    await SecureStore.setItemAsync(STORE_KEY, bytesToHex(created));
    privateKey = created;
  }
  return privateKey;
}

export async function publicKeySpkiBase64(): Promise<string> {
  const point = p256.getPublicKey(await loadKey(), false);
  return bytesToBase64(p256SpkiFromUncompressedPoint(point));
}

/** Sign a UTF-8 message with ECDSA P-256/SHA-256; returns the 64-byte r‖s signature as base64. */
export async function sign(message: string): Promise<string> {
  const signature = p256.sign(sha256(utf8ToBytes(message)), await loadKey());
  return bytesToBase64(signature.toCompactRawBytes());
}

export async function deleteKey(): Promise<void> {
  privateKey = null;
  await SecureStore.deleteItemAsync(STORE_KEY);
}
