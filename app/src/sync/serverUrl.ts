/** Validation of the server URL entered on Android (7.1). */

export type ServerUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Normalizes a server URL to its origin, e.g. "https://kcal.example.com".
 * Release builds only accept https://; development builds also allow http:// (local dev server).
 */
export function parseServerUrl(input: string, allowHttp: boolean): ServerUrlResult {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const match = /^(https?):\/\/([^/?#\s]+)\/*$/i.exec(withScheme);
  if (!trimmed || !match) {
    return { ok: false, error: 'Enter a server address, e.g. https://kcal.example.com' };
  }
  const scheme = match[1].toLowerCase();
  if (scheme === 'http' && !allowHttp) {
    return { ok: false, error: 'Only https:// addresses are allowed' };
  }
  return { ok: true, url: `${scheme}://${match[2].toLowerCase()}` };
}
