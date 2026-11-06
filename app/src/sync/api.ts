/**
 * Typed fetch client of the server API (9.6) with AbortController timeouts:
 * 3 s for health, 15 s for everything else.
 */
import type {
  ChallengeResponse,
  DeviceInfo,
  HealthResponse,
  PairingCodeResponse,
  PairRequest,
  PairResponse,
  PullResponse,
  PushRequest,
  PushResponse,
  TokenRequest,
  TokenResponse
} from './types';

export const HEALTH_TIMEOUT_MS = 3_000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const PULL_LIMIT = 500;

/** The server answered with an error; `code` is the machine-readable ProblemDetails code (8.4). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The server could not be reached. Best effort: React Native reports timeouts, DNS, connection
 * and TLS errors alike as "Network request failed", so only timeouts are told apart.
 */
export class NetworkError extends Error {
  constructor(readonly reason: 'timeout' | 'network') {
    super(reason === 'timeout' ? 'The server did not answer in time' : 'Network or certificate error');
    this.name = 'NetworkError';
  }
}

export interface ApiClient {
  health(): Promise<HealthResponse>;
  pair(request: PairRequest): Promise<PairResponse>;
  challenge(deviceId: string): Promise<ChallengeResponse>;
  token(request: TokenRequest): Promise<TokenResponse>;
  push(request: PushRequest, accessToken: string): Promise<PushResponse>;
  pull(cursor: number, accessToken: string): Promise<PullResponse>;
  listDevices(accessToken: string): Promise<DeviceInfo[]>;
  revokeDevice(deviceId: string, accessToken: string): Promise<void>;
  createPairingCode(accessToken: string): Promise<PairingCodeResponse>;
}

type Fetch = typeof fetch;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  timeoutMs?: number;
}

export function createApiClient(baseUrl: string, fetchFn: Fetch = fetch): ApiClient {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, { method = 'GET', body, accessToken, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch {
      throw new NetworkError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await toApiError(response);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  return {
    health: () => request('/api/v1/health', { timeoutMs: HEALTH_TIMEOUT_MS }),
    pair: (body) => request('/api/v1/devices/pair', { method: 'POST', body }),
    challenge: (deviceId) => request('/api/v1/auth/challenge', { method: 'POST', body: { deviceId } }),
    token: (body) => request('/api/v1/auth/token', { method: 'POST', body }),
    push: (body, accessToken) => request('/api/v1/sync/push', { method: 'POST', body, accessToken }),
    pull: (cursor, accessToken) =>
      request(`/api/v1/sync/pull?cursor=${cursor}&limit=${PULL_LIMIT}`, { accessToken }),
    listDevices: (accessToken) => request('/api/v1/devices', { accessToken }),
    revokeDevice: (deviceId, accessToken) =>
      request(`/api/v1/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE', accessToken }),
    createPairingCode: (accessToken) => request('/api/v1/pairing-codes', { method: 'POST', accessToken })
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const problem = (await response.json()) as { code?: unknown; title?: unknown };
    const code = typeof problem.code === 'string' ? problem.code : null;
    const title = typeof problem.title === 'string' ? problem.title : `HTTP ${response.status}`;
    return new ApiError(response.status, code, title);
  } catch {
    return new ApiError(response.status, null, `HTTP ${response.status}`);
  }
}
