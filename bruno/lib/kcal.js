// Signing helpers for the Bruno collection (sections 7.2–7.4).
// Needs Bruno's developer-mode sandbox (Node `crypto`) and KCAL_DEV_KEY_PKCS8 in bruno/.env.
// Request scripts pass the key in: kcal.devKey(bru.getProcessEnv("KCAL_DEV_KEY_PKCS8")).
const crypto = require('crypto');

/** The dev key from a base64 PKCS#8 DER string. */
function devKey(pkcs8) {
  if (!pkcs8) {
    throw new Error('Set KCAL_DEV_KEY_PKCS8 in bruno/.env (see bruno/.env.example)');
  }
  return crypto.createPrivateKey({ key: Buffer.from(pkcs8, 'base64'), format: 'der', type: 'pkcs8' });
}

/** The dev key's public key as base64 SubjectPublicKeyInfo DER. */
function publicKeySpkiBase64(key) {
  return crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
}

/** ECDSA P-256/SHA-256 over the UTF-8 message, as a base64 64-byte r‖s signature. */
function sign(key, message) {
  return crypto.sign('sha256', Buffer.from(message, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');
}

/** Uppercase, remove '-' and spaces, map O→0 and I/L→1 (7.3). */
function normalizePairingCode(code) {
  return code.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

function pairingSignature(key, serverId, code, publicKey) {
  return sign(key, `kcal-pair-v1\n${serverId}\n${normalizePairingCode(code)}\n${publicKey}`);
}

function authSignature(key, serverId, deviceId, nonce) {
  return sign(key, `kcal-auth-v1\n${serverId}\n${deviceId}\n${nonce}`);
}

/** A UTC timestamp with milliseconds, e.g. 2026-11-03T11:31:02.120Z. */
function utcNow(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** An entry change for push (6.2). */
function entryChange(id, fields) {
  const now = utcNow();
  return {
    id,
    baseVersion: null,
    deleted: false,
    updatedAt: now,
    name: 'Chicken breast, grilled (200 g)',
    kcal: 330,
    proteinG: 62,
    carbsG: 0,
    fatG: 7.2,
    fibreG: 0,
    quantity: 1,
    mealType: null,
    notes: null,
    eatenAt: '2026-11-03T12:30:00+01:00',
    loggedAt: now,
    ...fields
  };
}

module.exports = { devKey, publicKeySpkiBase64, pairingSignature, authSignature, utcNow, entryChange };
