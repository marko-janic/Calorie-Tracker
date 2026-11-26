export type ScannerType = 'ean13' | 'ean8' | 'upc_a' | 'upc_e';

/** The barcode types the camera scans for (B1). */
export const BARCODE_SCANNER_TYPES: ScannerType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

/**
 * Strip all whitespace from a typed or scanned number.
 * Null unless only digits remain.
 */
export function normalizeBarcode(input: string): string | null {
  const digits = input.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? digits : null;
}

/**
 * Expand an 8-digit UPC-E code (number system, six digits, check digit) to its 12-digit UPC-A form.
 * Null unless the code has 8 digits and number system 0 or 1.
 */
export function expandUpcE(code: string): string | null {
  const match = /^([01])(\d)(\d)(\d)(\d)(\d)(\d)(\d)$/.exec(code);
  if (!match) {
    return null;
  }
  const [, system, d1, d2, d3, d4, d5, d6, check] = match;
  switch (d6) {
    case '0':
    case '1':
    case '2':
      return `${system}${d1}${d2}${d6}0000${d3}${d4}${d5}${check}`;
    case '3':
      return `${system}${d1}${d2}${d3}00000${d4}${d5}${check}`;
    case '4':
      return `${system}${d1}${d2}${d3}${d4}00000${d5}${check}`;
    default:
      return `${system}${d1}${d2}${d3}${d4}${d5}0000${d6}${check}`;
  }
}

/**
 * True for 8, 12 or 13 digits with a correct GS1 check digit. 8 digits are checked as EAN-8, so a
 * UPC-E code has to be expanded first: its check digit belongs to the 12-digit form.
 */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) {
    return false;
  }
  // Weights 3, 1, 3, ... from the digit left of the check digit
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(code[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

function validOrNull(code: string | null): string | null {
  return code !== null && isValidBarcode(code) ? code : null;
}

/**
 * The code to look up for a scanned or typed number, or null if it is not a valid barcode.
 * Scans pass their scanner type, typed numbers do not.
 * - `upc_e`: expanded to 12 digits, which are then checked. A scan that already has 12 digits is
 *   checked as it is, in case the camera reports the expanded form.
 * - Other scanner types: checked as they are.
 * - A typed 8-digit number: an EAN-8 if it is valid as one, else a UPC-E code if it expands to a valid one.
 * - 12 and 13 digits: checked as they are. OFF accepts 12-digit codes, so there is no padding.
 */
export function toLookupCode(input: string, scannerType?: string): string | null {
  const code = normalizeBarcode(input);
  if (code === null) {
    return null;
  }
  if (scannerType === 'upc_e') {
    return validOrNull(code.length === 12 ? code : expandUpcE(code));
  }
  if (scannerType === undefined && code.length === 8) {
    return validOrNull(code) ?? validOrNull(expandUpcE(code));
  }
  return validOrNull(code);
}
