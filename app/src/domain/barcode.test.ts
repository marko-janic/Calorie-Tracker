import {
  BARCODE_SCANNER_TYPES,
  expandUpcE,
  isValidBarcode,
  normalizeBarcode,
  toLookupCode
} from './barcode';
import type { ScannerType } from './barcode';

// Check digit of a code without its last digit, with the weights counted from the left
function checkDigitOf(body: string): string {
  const sum = [...body].reduce((total, digit, i) => total + Number(digit) * ((body.length - i) % 2 === 1 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

function withWrongCheckDigit(code: string): string {
  return code.slice(0, -1) + String((Number(code[code.length - 1]) + 1) % 10);
}

function validCodeOfLength(length: number): string {
  const body = '123456789012345'.slice(0, length - 1);
  return body + checkDigitOf(body);
}

const EAN13 = '5449000000996';
const UPC_A = '036000291452';
const EAN8 = '96385074';

// One row per line of the UPC-E table in plan WP2. `short` is the number system and the six digits
// of the short code, `upcA` the 11 digits before the check digit of the 12-digit form. Both get the
// same check digit, which is calculated for the 12-digit form.
const UPC_E_ROWS = [
  { layout: 'd6 = 0 (number system 0)', short: '0123450', upcA: '01200000345' },
  { layout: 'd6 = 1 (number system 1)', short: '1123451', upcA: '11210000345' },
  { layout: 'd6 = 2 (number system 0)', short: '0123452', upcA: '01220000345' },
  { layout: 'd6 = 3 (number system 0)', short: '0123453', upcA: '01230000045' },
  { layout: 'd6 = 4 (number system 1)', short: '1123454', upcA: '11234000005' },
  { layout: 'd6 = 5 (number system 0)', short: '0123455', upcA: '01234500005' },
  { layout: 'd6 = 9 (number system 1)', short: '1123459', upcA: '11234500009' }
].map(({ layout, short, upcA }) => {
  const check = checkDigitOf(upcA);
  return { layout, upcE: short + check, upcA: upcA + check };
});

// A valid UPC-E code (check digit of the 12-digit form) that is not a valid EAN-8 code
const UPC_E_NOT_EAN8 = UPC_E_ROWS[0];

describe('normalizeBarcode', () => {
  it('strips all whitespace and keeps leading zeros', () => {
    expect(normalizeBarcode(' 5449 0000\t00996\n')).toBe('5449000000996');
    expect(normalizeBarcode('\u00a000012345 ')).toBe('00012345');
  });

  it.each(['', '   ', 'abc', '12a45', '1-2', '12.5', '+12', '\uff11\uff12\uff13'])('rejects %j', (input) => {
    expect(normalizeBarcode(input)).toBeNull();
  });
});

describe('expandUpcE', () => {
  it.each(UPC_E_ROWS)('expands $layout', ({ upcE, upcA }) => {
    expect(isValidBarcode(upcA)).toBe(true);
    expect(expandUpcE(upcE)).toBe(upcA);
  });

  it('expands the example from the plan', () => {
    expect(expandUpcE('01234565')).toBe('012345000065');
  });

  it('leaves the check digit to isValidBarcode', () => {
    expect(expandUpcE('01234560')).toBe('012345000060');
    expect(isValidBarcode('012345000060')).toBe(false);
  });

  it.each(['', '0123456', '012345650', '0123456a', '21234565', '91234565', '012345000065'])('returns null for %j', (code) => {
    expect(expandUpcE(code)).toBeNull();
  });
});

describe('isValidBarcode', () => {
  it.each([
    ['EAN-13', EAN13],
    ['EAN-13', '3017620422003'],
    ['EAN-13', '4006381333931'],
    ['UPC-A', UPC_A],
    ['UPC-A', '049000028911'],
    ['EAN-8', EAN8],
    ['EAN-8', '73513537']
  ])('accepts a valid %s code (%s)', (_type, code) => {
    expect(isValidBarcode(code)).toBe(true);
  });

  it.each([EAN13, UPC_A, EAN8])('rejects %s with a wrong check digit', (code) => {
    expect(isValidBarcode(withWrongCheckDigit(code))).toBe(false);
  });

  it.each([1, 7, 9, 10, 11, 14, 15])('rejects %i digits even with a correct check digit', (length) => {
    expect(isValidBarcode(validCodeOfLength(length))).toBe(false);
  });

  it.each([8, 12, 13])('accepts %i digits with a correct check digit', (length) => {
    expect(isValidBarcode(validCodeOfLength(length))).toBe(true);
  });

  it.each(['', ' 5449000000996', '5449000000996 ', '54490000009a6', '5449-000000996'])('rejects %j', (code) => {
    expect(isValidBarcode(code)).toBe(false);
  });

  it('does not check a UPC-E code in its short form', () => {
    expect(isValidBarcode(UPC_E_NOT_EAN8.upcE)).toBe(false);
    expect(isValidBarcode(UPC_E_NOT_EAN8.upcA)).toBe(true);
  });
});

describe('toLookupCode with a scanner type', () => {
  it('checks EAN-13, EAN-8 and UPC-A codes as they are', () => {
    expect(toLookupCode(EAN13, 'ean13')).toBe(EAN13);
    expect(toLookupCode(EAN8, 'ean8')).toBe(EAN8);
    expect(toLookupCode(UPC_A, 'upc_a')).toBe(UPC_A);
  });

  it('rejects a wrong check digit', () => {
    expect(toLookupCode(withWrongCheckDigit(EAN13), 'ean13')).toBeNull();
    expect(toLookupCode(withWrongCheckDigit(EAN8), 'ean8')).toBeNull();
    expect(toLookupCode(withWrongCheckDigit(UPC_A), 'upc_a')).toBeNull();
  });

  it.each(UPC_E_ROWS)('expands upc_e codes with $layout', ({ upcE, upcA }) => {
    expect(toLookupCode(upcE, 'upc_e')).toBe(upcA);
  });

  it('expands the example from the plan even though it is also a valid EAN-8 code', () => {
    expect(isValidBarcode('01234565')).toBe(true);
    expect(toLookupCode('01234565', 'upc_e')).toBe('012345000065');
  });

  it('checks the 12 digits of a upc_e scan, not the short form', () => {
    expect(toLookupCode(withWrongCheckDigit(UPC_E_NOT_EAN8.upcE), 'upc_e')).toBeNull();
  });

  it('rejects a upc_e scan that is not 8 or 12 digits or has number system 2 to 9', () => {
    expect(toLookupCode(EAN13, 'upc_e')).toBeNull();
    expect(toLookupCode('0123456', 'upc_e')).toBeNull();
    expect(toLookupCode('21234567', 'upc_e')).toBeNull();
  });

  it('takes a upc_e scan that is already in its 12-digit form as it is, and checks it', () => {
    const { upcA } = UPC_E_NOT_EAN8;
    expect(toLookupCode(upcA, 'upc_e')).toBe(upcA);
    expect(toLookupCode(withWrongCheckDigit(upcA), 'upc_e')).toBeNull();
  });

  it('does not expand an 8-digit code of another scanner type', () => {
    expect(toLookupCode(UPC_E_NOT_EAN8.upcE, 'ean8')).toBeNull();
    expect(toLookupCode(UPC_E_NOT_EAN8.upcE, 'code128')).toBeNull();
  });

  it('gets a valid code through for every camera scanner type', () => {
    const samples: Record<ScannerType, [string, string]> = {
      ean13: [EAN13, EAN13],
      ean8: [EAN8, EAN8],
      upc_a: [UPC_A, UPC_A],
      upc_e: [UPC_E_NOT_EAN8.upcE, UPC_E_NOT_EAN8.upcA]
    };
    expect([...BARCODE_SCANNER_TYPES].sort()).toEqual(Object.keys(samples).sort());
    for (const type of BARCODE_SCANNER_TYPES) {
      const [scanned, expected] = samples[type];
      expect(toLookupCode(scanned, type)).toBe(expected);
    }
  });
});

describe('toLookupCode without a scanner type', () => {
  it('accepts a valid EAN-8 code', () => {
    expect(toLookupCode(EAN8)).toBe(EAN8);
  });

  it('expands a UPC-E code whose short form is not a valid EAN-8 code', () => {
    const { upcE, upcA } = UPC_E_NOT_EAN8;
    expect(toLookupCode(upcE)).toBe(upcA);
    expect(toLookupCode(`${upcE.slice(0, 4)} ${upcE.slice(4)}`)).toBe(upcA);
  });

  it('looks up an 8-digit number that is valid as EAN-8 and as UPC-E as an EAN-8 code', () => {
    expect(isValidBarcode('012345000065')).toBe(true);
    expect(toLookupCode('01234565')).toBe('01234565');
  });

  it('rejects an 8-digit number that is neither', () => {
    expect(toLookupCode('01234560')).toBeNull();
    expect(toLookupCode(withWrongCheckDigit(UPC_E_NOT_EAN8.upcE))).toBeNull();
  });

  it('does not expand an 8-digit number with number system 2 to 9', () => {
    expect(isValidBarcode('21234567')).toBe(false);
    expect(toLookupCode('21234567')).toBeNull();
  });

  it('checks 12 and 13 digits as they are, without padding', () => {
    expect(toLookupCode(UPC_A)).toBe(UPC_A);
    expect(toLookupCode(EAN13)).toBe(EAN13);
    expect(toLookupCode(`0${UPC_A}`)).toBe(`0${UPC_A}`);
  });

  it('rejects a wrong check digit', () => {
    expect(toLookupCode(withWrongCheckDigit(EAN13))).toBeNull();
    expect(toLookupCode(withWrongCheckDigit(UPC_A))).toBeNull();
    expect(toLookupCode(withWrongCheckDigit(EAN8))).toBeNull();
  });

  it.each([1, 7, 9, 10, 11, 14])('rejects %i digits', (length) => {
    expect(toLookupCode(validCodeOfLength(length))).toBeNull();
  });

  it('ignores spaces', () => {
    expect(toLookupCode(' 5449 000000 996 ')).toBe(EAN13);
    expect(toLookupCode('\t96385074\n')).toBe(EAN8);
  });

  it.each(['', '   ', 'abc', '5449000000996x', '5449-000000996', '5449.000000996'])('rejects %j', (input) => {
    expect(toLookupCode(input)).toBeNull();
    expect(toLookupCode(input, 'ean13')).toBeNull();
  });
});
