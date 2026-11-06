/**
 * @jest-environment node
 */
import { createPublicKey, verify } from 'crypto';

import { deleteKey, getOrCreateKey, publicKeySpkiBase64, sign } from './deviceKey.native';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      store.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      store.delete(key);
    }
  };
});

/** Verifies like the server: SPKI public key, SHA-256, IEEE P1363 (r‖s) signature (7.2). */
function verifyLikeServer(publicKeyBase64: string, message: string, signatureBase64: string): boolean {
  const key = createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
  return verify('sha256', Buffer.from(message, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureBase64, 'base64'));
}

describe('deviceKey (Android)', () => {
  afterEach(async () => {
    await deleteKey();
  });

  it('signs messages that verify against its SPKI public key', async () => {
    await getOrCreateKey();
    const publicKey = await publicKeySpkiBase64();
    const message = 'kcal-auth-v1\nserver\ndevice\nnonce';

    const signature = await sign(message);

    expect(Buffer.from(publicKey, 'base64')).toHaveLength(91);
    expect(Buffer.from(signature, 'base64')).toHaveLength(64);
    expect(verifyLikeServer(publicKey, message, signature)).toBe(true);
    expect(verifyLikeServer(publicKey, `${message}x`, signature)).toBe(false);
  });

  it('keeps the key until it is deleted', async () => {
    const first = await publicKeySpkiBase64();
    expect(await publicKeySpkiBase64()).toBe(first);

    await deleteKey();

    expect(await publicKeySpkiBase64()).not.toBe(first);
  });
});
