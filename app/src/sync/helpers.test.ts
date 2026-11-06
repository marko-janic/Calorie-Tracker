import { parseServerUrl } from './serverUrl';
import { INITIAL_SNAPSHOT, statusLine, skippedDeletionsText } from './status';
import { compareVersions, isUpdateAvailable, isUpdateRequired } from './versions';

const health = { status: 'ok', serverId: 'id', serverVersion: '0.4.0', apiVersion: 1, minAppVersion: '0.3.0' };

describe('versions', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.2', '0.1.10')).toBeLessThan(0);
  });

  it('requires an update for another API version or an older app', () => {
    expect(isUpdateRequired(health, '0.3.0')).toBe(false);
    expect(isUpdateRequired(health, '0.2.9')).toBe(true);
    expect(isUpdateRequired({ ...health, apiVersion: 2 }, '0.4.0')).toBe(true);
  });

  it('reports a newer server version as an available update', () => {
    expect(isUpdateAvailable(health, '0.3.0')).toBe(true);
    expect(isUpdateAvailable(health, '0.4.0')).toBe(false);
  });
});

describe('parseServerUrl', () => {
  it('normalizes to the origin and adds https://', () => {
    expect(parseServerUrl(' kcal.example.com/ ', false)).toEqual({ ok: true, url: 'https://kcal.example.com' });
    expect(parseServerUrl('HTTPS://Kcal.Example.Com:8443', false)).toEqual({ ok: true, url: 'https://kcal.example.com:8443' });
  });

  it('rejects http:// unless allowed (development builds)', () => {
    expect(parseServerUrl('http://192.168.1.10:5080', false).ok).toBe(false);
    expect(parseServerUrl('http://192.168.1.10:5080', true)).toEqual({ ok: true, url: 'http://192.168.1.10:5080' });
  });

  it('rejects paths, other schemes and empty input', () => {
    expect(parseServerUrl('https://kcal.example.com/api', false).ok).toBe(false);
    expect(parseServerUrl('ftp://kcal.example.com', false).ok).toBe(false);
    expect(parseServerUrl('', false).ok).toBe(false);
  });
});

describe('statusLine', () => {
  const time = (utc: string) => utc.substring(11, 16);

  it('shows the state texts of 6.6', () => {
    expect(statusLine(INITIAL_SNAPSHOT, time)).toBeNull();
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'syncing' } }, time)).toBe('Syncing…');
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'idle' }, lastSyncAt: '2026-11-03T10:42:00.000Z' }, time)).toBe('Synced 10:42');
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'offline', reason: 'timeout' }, waiting: 3 }, time)).toBe('Not connected · 3 waiting');
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'needsPairing', reason: 'deviceRemoved' } }, time)).toBe('This device was removed – pair again');
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'needsPairing', reason: 'serverChanged' } }, time)).toBe('Server was reset – pair again');
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'updateRequired' } }, time)).toBe('Update required to sync');
    expect(statusLine({ ...INITIAL_SNAPSHOT, status: { state: 'error', message: 'HTTP 500' } }, time)).toBe('Sync error');
  });

  it('describes skipped deletions', () => {
    expect(skippedDeletionsText(1)).toBe('1 deletion skipped – the entry was changed on another device');
  });
});
