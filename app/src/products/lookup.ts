import Constants from 'expo-constants';

import { OffProductSchema } from '../domain/product';
import type { OffProduct } from '../domain/product';

export type LookupResult =
  | { status: 'found'; product: OffProduct }
  | { status: 'notFound' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export const LOOKUP_TIMEOUT_MS = 8_000;

// Open Food Facts asks apps to identify themselves in the User-Agent as AppName/Version (contact).
// The contact is the project's public repository, where they can open an issue.
export const OFF_CONTACT = 'https://github.com/marko-janic/Calorie-Tracker';

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v3/product';
const FIELDS =
  'product_name,brands,nutriments,serving_quantity,serving_quantity_unit,serving_size,product_quantity_unit,quantity';

const RATE_LIMITED = 'Open Food Facts is rate limiting requests. Try again in a minute.';
const UNREADABLE = 'Open Food Facts sent an answer the app cannot read.';
const NO_PRODUCT = 'Open Food Facts sent no usable product data.';

/**
 * Look a barcode up on Open Food Facts. One attempt, never throws.
 * A timeout or a network failure is `offline`. If `signal` aborts, the result is an `error` that the
 * caller is expected to ignore.
 */
export async function lookupBarcode(
  code: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<LookupResult> {
  if (signal?.aborted) {
    return cancelled();
  }
  const url = lookupUrl(code);
  if (url === null) {
    return error('The barcode is not valid.');
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, LOOKUP_TIMEOUT_MS);

  let answer: { status: number; body: string };
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: lookupHeaders(), signal: controller.signal });
    answer = { status: response.status, body: await response.text() };
  } catch {
    return signal?.aborted ? cancelled() : { status: 'offline' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }

  return signal?.aborted ? cancelled() : toResult(answer.status, answer.body);
}

function lookupUrl(code: string): string | null {
  try {
    return `${PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
  } catch {
    // encodeURIComponent throws on a lone surrogate
    return null;
  }
}

function lookupHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': `Kcal/${Constants.expoConfig?.version ?? '0.0.0'} (${OFF_CONTACT})`
  };
}

function error(message: string): LookupResult {
  return { status: 'error', message };
}

function cancelled(): LookupResult {
  return error('Lookup cancelled');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// OFF answers an unknown or invalid code with HTTP 404 and this body. A 200 answer with it counts too.
function isNotFoundBody(body: unknown): boolean {
  return isRecord(body) && isRecord(body.result) && body.result.id === 'product_not_found';
}

function toResult(status: number, text: string): LookupResult {
  if (status === 429) {
    return error(RATE_LIMITED);
  }
  const body = parseJson(text);
  if (status === 404 && isNotFoundBody(body)) {
    return { status: 'notFound' };
  }
  if (status < 200 || status > 299) {
    return error(`Open Food Facts answered with HTTP ${status}.`);
  }
  if (body === undefined) {
    return error(UNREADABLE);
  }
  if (isNotFoundBody(body)) {
    return { status: 'notFound' };
  }
  const product = OffProductSchema.safeParse(isRecord(body) ? body.product : undefined);
  return product.success ? { status: 'found', product: product.data } : error(NO_PRODUCT);
}
