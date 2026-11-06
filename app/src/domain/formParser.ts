import { parseDecimalInput } from './totals';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type FormResult<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };

export interface NumberRange {
  min: number;
  max: number;
  integer?: boolean;
}

/**
 * Collects field errors while parsing the text fields of a form.
 * Parsed values of fields with errors are placeholders; `result` only returns the value if there are no errors.
 */
export class FormParser<K extends string> {
  private readonly errors: FieldErrors<K> = {};

  requiredNumber(field: K, text: string, range: NumberRange): number {
    return this.parseNumber(text, range) ?? this.fail(field, rangeMessage(range), NaN);
  }

  optionalNumber(field: K, text: string, range: NumberRange): number | null {
    return text.trim() === '' ? null : this.requiredNumber(field, text, range);
  }

  /** Trimmed, non-empty text. */
  requiredText(field: K, text: string, maxLength: number): string {
    return this.optionalText(field, text, maxLength) ?? this.fail(field, 'Required', '');
  }

  /** Trimmed text, or null if empty. */
  optionalText(field: K, text: string, maxLength: number): string | null {
    const trimmed = text.trim();
    if (trimmed.length > maxLength) {
      return this.fail(field, `At most ${maxLength} characters`, trimmed);
    }
    return trimmed === '' ? null : trimmed;
  }

  /** A value picked from a fixed set of options; null means nothing is picked yet. */
  choice<T>(field: K, value: T | null): T {
    return value ?? this.fail(field, 'Required', value as T);
  }

  result<T>(value: T): FormResult<T, K> {
    return Object.keys(this.errors).length > 0 ? { ok: false, errors: this.errors } : { ok: true, value };
  }

  private parseNumber(text: string, { min, max, integer }: NumberRange): number | null {
    const value = parseDecimalInput(text);
    if (value === null || value < min || value > max || (integer && !Number.isInteger(value))) {
      return null;
    }
    return value;
  }

  private fail<T>(field: K, message: string, placeholder: T): T {
    this.errors[field] = message;
    return placeholder;
  }
}

function rangeMessage({ min, max, integer }: NumberRange): string {
  return `Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}`;
}

/**
 * Text for a number input field; null (unknown) becomes an empty field.
 */
export function numberToField(value: number | null): string {
  return value === null ? '' : String(value);
}
