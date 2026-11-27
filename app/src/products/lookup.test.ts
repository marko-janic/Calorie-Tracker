import cokeResponse from '../domain/__fixtures__/off/5449000000996.json';
import cokeGramsResponse from '../domain/__fixtures__/off/5000112637922.json';
import nutellaJarResponse from '../domain/__fixtures__/off/3017620422003.json';
import nutellaServingResponse from '../domain/__fixtures__/off/4008400402222.json';
import { OffProductSchema } from '../domain/product';
import { LOOKUP_TIMEOUT_MS, OFF_CONTACT, lookupBarcode } from './lookup';

const mockConstants: { expoConfig: { version?: string } | null } = { expoConfig: { version: '1.2.3' } };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    }
  }
}));

const CODE = '5449000000996';
const CANCELLED = { status: 'error', message: 'Lookup cancelled' };

// The answer OFF gives for an unknown or invalid code, with HTTP 404
const NOT_FOUND_BODY = {
  code: '00000017',
  errors: [
    {
      field: { id: 'code', value: '00000017' },
      impact: { id: 'failure', lc_name: 'Failure', name: 'Failure' },
      message: { id: 'invalid_code', lc_name: 'Invalid code', name: 'Invalid code' }
    },
    {
      field: { id: 'code', value: '00000017' },
      impact: { id: 'failure', lc_name: 'Failure', name: 'Failure' },
      message: { id: 'product_not_found', lc_name: '', name: '' }
    }
  ],
  result: { id: 'product_not_found', lc_name: 'Product not found', name: 'Product not found' },
  status: 'failure',
  warnings: []
};

const RATE_LIMIT_PAGE =
  '<html> <head><title>429 Too Many Requests</title></head> <body> <center><h1>429 Too Many Requests</h1></center> <hr><center>nginx</center> </body> </html>';
const ERROR_PAGE = '<!DOCTYPE html><html><head><title>Page temporarily unavailable</title></head><body>Try again later</body></html>';

type Call = { url: string; init: RequestInit };

// Not every Jest environment has a global Response, so the stub answers with the parts the lookup reads
function reply(status: number, body: string, readBody: () => Promise<string> = async () => body): Response {
  return { ok: status >= 200 && status < 300, status, text: readBody } as Response;
}

function replyJson(status: number, body: unknown): Response {
  return reply(status, JSON.stringify(body));
}

function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function answering(response: Response) {
  return stubFetch(() => response);
}

function abortError(): Error {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

// Never answers, but rejects like a real fetch when its signal aborts
function hangingFetch() {
  return stubFetch(
    ({ init }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(abortError()));
      })
  );
}

afterEach(() => {
  jest.useRealTimers();
  mockConstants.expoConfig = { version: '1.2.3' };
});

describe('lookupBarcode: found', () => {
  it.each([
    ['5449000000996', cokeResponse],
    ['5000112637922', cokeGramsResponse],
    ['3017620422003', nutellaJarResponse],
    ['4008400402222', nutellaServingResponse]
  ])('returns the product of %s', async (code, response) => {
    const { fetchImpl } = answering(replyJson(200, response));
    await expect(lookupBarcode(code, undefined, fetchImpl)).resolves.toEqual({
      status: 'found',
      product: OffProductSchema.parse(response.product)
    });
  });

  it('parses the fields of the product', async () => {
    const { fetchImpl } = answering(replyJson(200, cokeResponse));
    const result = await lookupBarcode(CODE, undefined, fetchImpl);
    expect(result.status === 'found' && result.product).toMatchObject({
      product_name: 'Coca-Cola Original',
      brands: 'COCA-COLA SERVICES SA/NV',
      serving_quantity: 330,
      nutriments: { 'energy-kcal_100g': 44 }
    });
  });

  it('accepts the envelope with only the fields the lookup needs', async () => {
    const product = { product_name: 'Oat drink', nutriments: { 'energy-kcal_100g': '46' } };
    const body = { code: CODE, status: 'success', result: { id: 'product_found' }, product };
    const { fetchImpl } = answering(replyJson(200, body));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({
      status: 'found',
      product: { product_name: 'Oat drink', nutriments: { 'energy-kcal_100g': 46 } }
    });
  });

  it('accepts a status other than success', async () => {
    const body = { code: CODE, status: 'success_with_warnings', result: { id: 'product_found' }, product: {} };
    const { fetchImpl } = answering(replyJson(200, body));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({ status: 'found', product: {} });
  });
});

describe('lookupBarcode: notFound', () => {
  it('is notFound for the 404 answer of an unknown code', async () => {
    const { fetchImpl } = answering(replyJson(404, NOT_FOUND_BODY));
    await expect(lookupBarcode('00000017', undefined, fetchImpl)).resolves.toEqual({ status: 'notFound' });
  });

  it('is notFound for a 200 answer that says product_not_found', async () => {
    const body = { status: 'failure', result: { id: 'product_not_found' } };
    const { fetchImpl } = answering(replyJson(200, body));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({ status: 'notFound' });
  });

  it.each([
    ['an HTML page', reply(404, ERROR_PAGE)],
    ['an empty body', reply(404, '')],
    ['JSON with another result id', replyJson(404, { status: 'failure', result: { id: 'something_else' } })],
    ['JSON without a result', replyJson(404, { status: 'failure' })],
    ['a JSON list', replyJson(404, ['product_not_found'])]
  ])('is an error for a 404 with %s', async (_name, response) => {
    const { fetchImpl } = answering(response);
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({
      status: 'error',
      message: 'Open Food Facts answered with HTTP 404.'
    });
  });
});

describe('lookupBarcode: errors', () => {
  it.each([
    ['the nginx page', reply(429, RATE_LIMIT_PAGE)],
    ['a JSON body', replyJson(429, { status: 'failure' })]
  ])('explains a rate limit with %s', async (_name, response) => {
    const { fetchImpl } = answering(response);
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({
      status: 'error',
      message: 'Open Food Facts is rate limiting requests. Try again in a minute.'
    });
  });

  it.each([400, 403, 500, 502, 503, 504])('is an error for HTTP %i', async (status) => {
    const { fetchImpl } = answering(reply(status, ERROR_PAGE));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({
      status: 'error',
      message: `Open Food Facts answered with HTTP ${status}.`
    });
  });

  it('is an error for a product body with an HTTP error status', async () => {
    const { fetchImpl } = answering(replyJson(500, cokeResponse));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toMatchObject({ status: 'error' });
  });

  it('is an error for an HTML page with status 200', async () => {
    const { fetchImpl } = answering(reply(200, ERROR_PAGE));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({
      status: 'error',
      message: 'Open Food Facts sent an answer the app cannot read.'
    });
  });

  it.each(['{"product": ', '', 'not json'])('is an error for the invalid JSON %j', async (body) => {
    const { fetchImpl } = answering(reply(200, body));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toMatchObject({ status: 'error' });
  });

  it.each([
    ['a product that is a string', { status: 'success', product: 'nope' }],
    ['a product that is null', { status: 'success', product: null }],
    ['a product that is a list', { status: 'success', product: [] }],
    ['no product', { status: 'success', result: { id: 'product_found' } }],
    ['a body that is a list', []],
    ['a body that is null', null],
    ['a body that is a number', 42]
  ])('is an error for %s', async (_name, body) => {
    const { fetchImpl } = answering(replyJson(200, body));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({
      status: 'error',
      message: 'Open Food Facts sent no usable product data.'
    });
  });

  it('is an error for a code that cannot be put in a URL, without a request', async () => {
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    await expect(lookupBarcode('\ud800', undefined, fetchImpl)).resolves.toEqual({
      status: 'error',
      message: 'The barcode is not valid.'
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['an HTTP 503', () => reply(503, ERROR_PAGE)],
    ['an HTTP 429', () => reply(429, RATE_LIMIT_PAGE)],
    ['a network failure', () => Promise.reject(new TypeError('Network request failed'))]
  ])('makes one attempt only after %s', async (_name, handler) => {
    const { fetchImpl, calls } = stubFetch(handler);
    await lookupBarcode(CODE, undefined, fetchImpl);
    expect(calls).toHaveLength(1);
  });
});

describe('lookupBarcode: offline', () => {
  it('is offline when the network request fails', async () => {
    const { fetchImpl } = stubFetch(() => Promise.reject(new TypeError('Network request failed')));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({ status: 'offline' });
  });

  it.each([
    ['an Error', new Error('connection reset')],
    ['text', 'boom'],
    ['undefined', undefined]
  ])('is offline when fetch rejects with %s', async (_name, reason) => {
    const { fetchImpl } = stubFetch(() => Promise.reject(reason));
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({ status: 'offline' });
  });

  it('is offline when fetch throws instead of returning a promise', async () => {
    const fetchImpl = (() => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({ status: 'offline' });
  });

  it('is offline when the connection drops while the body is read', async () => {
    const response = reply(200, '', () => Promise.reject(new TypeError('Network request failed')));
    const { fetchImpl } = answering(response);
    await expect(lookupBarcode(CODE, undefined, fetchImpl)).resolves.toEqual({ status: 'offline' });
  });

  it('is offline when the request takes longer than 8 seconds', async () => {
    jest.useFakeTimers();
    const { fetchImpl, calls } = hangingFetch();
    const result = lookupBarcode(CODE, undefined, fetchImpl);

    await jest.advanceTimersByTimeAsync(7_999);
    expect(calls[0].init.signal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(calls[0].init.signal?.aborted).toBe(true);
    await expect(result).resolves.toEqual({ status: 'offline' });
  });

  it('is offline when the body takes longer than the timeout', async () => {
    jest.useFakeTimers();
    const { fetchImpl } = stubFetch(({ init }) =>
      reply(
        200,
        '',
        () =>
          new Promise<string>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(abortError()));
          })
      )
    );
    const result = lookupBarcode(CODE, undefined, fetchImpl);
    await jest.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ status: 'offline' });
  });

  it('does not time out an answer that arrives in time', async () => {
    jest.useFakeTimers();
    const { fetchImpl } = answering(replyJson(200, cokeResponse));
    const result = await lookupBarcode(CODE, undefined, fetchImpl);
    expect(result.status).toBe('found');
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('lookupBarcode: cancelling', () => {
  it('returns a cancelled error when the caller aborts during the request', async () => {
    const { fetchImpl, calls } = hangingFetch();
    const controller = new AbortController();
    const result = lookupBarcode(CODE, controller.signal, fetchImpl);
    controller.abort();
    await expect(result).resolves.toEqual(CANCELLED);
    expect(calls[0].init.signal?.aborted).toBe(true);
  });

  it('does not make a request when the signal is already aborted', async () => {
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    const controller = new AbortController();
    controller.abort();
    await expect(lookupBarcode(CODE, controller.signal, fetchImpl)).resolves.toEqual(CANCELLED);
    expect(calls).toHaveLength(0);
  });

  it('does not return a product that arrives after the caller aborted', async () => {
    const controller = new AbortController();
    const response = reply(200, '', async () => {
      controller.abort();
      return JSON.stringify(cokeResponse);
    });
    const { fetchImpl } = answering(response);
    await expect(lookupBarcode(CODE, controller.signal, fetchImpl)).resolves.toEqual(CANCELLED);
  });

  it('prefers a cancelled result over offline when the caller aborts a failing request', async () => {
    const controller = new AbortController();
    const { fetchImpl } = stubFetch(() => {
      controller.abort();
      return Promise.reject(new TypeError('Network request failed'));
    });
    await expect(lookupBarcode(CODE, controller.signal, fetchImpl)).resolves.toEqual(CANCELLED);
  });

  it('stops listening to the signal and clears the timer when the lookup is done', async () => {
    jest.useFakeTimers();
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    const controller = new AbortController();
    await lookupBarcode(CODE, controller.signal, fetchImpl);
    controller.abort();
    expect(calls[0].init.signal?.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('lookupBarcode: request', () => {
  it('asks for the product with the fields the app uses', async () => {
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    await lookupBarcode(CODE, undefined, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://world.openfoodfacts.org/api/v3/product/5449000000996.json?fields=product_name,brands,nutriments,serving_quantity,serving_quantity_unit,serving_size,product_quantity_unit,quantity'
    );
    expect(calls[0].init.method).toBe('GET');
  });

  it('sends a User-Agent with the app version and the contact, and asks for JSON', async () => {
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    await lookupBarcode(CODE, undefined, fetchImpl);
    expect(calls[0].init.headers).toEqual({
      Accept: 'application/json',
      'User-Agent': `Kcal/1.2.3 (${OFF_CONTACT})`
    });
  });

  it.each([null, {}])('falls back to version 0.0.0 when the config is %j', async (expoConfig) => {
    mockConstants.expoConfig = expoConfig;
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    await lookupBarcode(CODE, undefined, fetchImpl);
    expect(calls[0].init.headers).toMatchObject({ 'User-Agent': `Kcal/0.0.0 (${OFF_CONTACT})` });
  });

  it('encodes the code in the URL', async () => {
    const { fetchImpl, calls } = answering(replyJson(404, NOT_FOUND_BODY));
    await lookupBarcode('12 3/4?x#y', undefined, fetchImpl);
    expect(calls[0].url).toContain('/product/12%203%2F4%3Fx%23y.json?fields=');
  });

  it('gives fetch its own signal, so the caller keeps its own', async () => {
    const { fetchImpl, calls } = answering(replyJson(200, cokeResponse));
    const controller = new AbortController();
    await lookupBarcode(CODE, controller.signal, fetchImpl);
    expect(calls[0].init.signal).toBeDefined();
    expect(calls[0].init.signal).not.toBe(controller.signal);
  });
});
