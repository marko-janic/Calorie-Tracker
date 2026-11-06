/**
 * Device key on the web (7.2): a non-extractable WebCrypto ECDSA P-256 key pair stored in IndexedDB.
 */
import { del, get, set } from 'idb-keyval';

import { bytesToBase64 } from './protocol';

const STORE_KEY = 'kcal.deviceKey.v1';

const ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };

let keyPair: CryptoKeyPair | null = null;

/** Load the device key, creating and storing it on first use. */
export async function getOrCreateKey(): Promise<void> {
  await loadKey();
}

async function loadKey(): Promise<CryptoKeyPair> {
  if (keyPair) {
    return keyPair;
  }
  const stored = await get<CryptoKeyPair>(STORE_KEY);
  if (stored) {
    keyPair = stored;
  } else {
    const created = await crypto.subtle.generateKey(ALGORITHM, false, ['sign', 'verify']);
    await set(STORE_KEY, created);
    keyPair = created;
  }
  return keyPair;
}

export async function publicKeySpkiBase64(): Promise<string> {
  const { publicKey } = await loadKey();
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki', publicKey)));
}

/** Sign a UTF-8 message with ECDSA P-256/SHA-256; returns the 64-byte r‖s signature as base64. */
export async function sign(message: string): Promise<string> {
  const { privateKey } = await loadKey();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(message)
  );
  return bytesToBase64(new Uint8Array(signature));
}

export async function deleteKey(): Promise<void> {
  keyPair = null;
  await del(STORE_KEY);
}
