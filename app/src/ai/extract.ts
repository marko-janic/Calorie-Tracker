import { AIImportSchemaForParsing, AIItem } from './schema';
import { ZodError } from 'zod';

export interface ExtractionSuccess {
  success: true;
  items: AIItem[];
  hadExtraKeys: boolean;
}

export interface ExtractionFailure {
  success: false;
  error: string;
  details?: string[];
}

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

/**
 * Extract and validate AI import from a text response.
 *
 * Per section 10.4:
 * 1. Find JSON (fenced block or first { to last })
 * 2. Parse it
 * 3. Validate with zod
 * 4. Return items or errors
 */
export function extractAIImport(text: string): ExtractionResult {
  // Step 1: Find the JSON
  const json = findJSON(text);
  if (!json) {
    return {
      success: false,
      error: "Couldn't find valid JSON in the answer"
    };
  }

  // Step 2: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      success: false,
      error: "Couldn't find valid JSON in the answer"
    };
  }

  // If the top-level value is an array, treat it as items with schemaVersion 1
  if (Array.isArray(parsed)) {
    parsed = {
      schemaVersion: 1,
      items: parsed
    };
  }

  // Step 3: Validate with zod (using non-strict schema to allow extra keys)
  const result = AIImportSchemaForParsing.safeParse(parsed);

  if (!result.success) {
    return {
      success: false,
      error: 'Validation failed',
      details: formatZodErrors(result.error)
    };
  }

  // Check for extra keys (warn but don't fail)
  const hadExtraKeys = hasExtraKeys(parsed as object);

  return {
    success: true,
    items: result.data.items,
    hadExtraKeys
  };
}

/**
 * Find JSON in text. Per section 10.4:
 * Try fenced code blocks first, then first { to last }
 * Handle bare top-level arrays only when the input starts with '['
 */
function findJSON(text: string): string | null {
  const trimmed = text.trim();

  // Try all fenced blocks first
  const allFenced = [...trimmed.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)];
  for (const match of allFenced) {
    const content = match[1].trim();
    try {
      JSON.parse(content);
      return content;
    } catch {
      continue;
    }
  }

  // Handle bare top-level array only if the trimmed input starts with '['
  // This must come before checking for objects, since arrays can contain objects
  if (trimmed.startsWith('[')) {
    const lastBracket = trimmed.lastIndexOf(']');
    if (lastBracket !== -1) {
      return trimmed.substring(0, lastBracket + 1);
    }
  }

  // Try from first { to last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1);
  }

  return null;
}

/**
 * Check if the parsed object has extra keys beyond what the schema expects
 */
function hasExtraKeys(obj: object): boolean {
  const knownTopLevel = ['schemaVersion', 'items'];
  const topKeys = Object.keys(obj);

  if (topKeys.some(k => !knownTopLevel.includes(k))) {
    return true;
  }

  // Check items
  if ('items' in obj && Array.isArray(obj.items)) {
    const knownItemKeys = ['name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'mealType', 'notes'];
    for (const item of obj.items) {
      if (typeof item === 'object' && item !== null) {
        const itemKeys = Object.keys(item);
        if (itemKeys.some(k => !knownItemKeys.includes(k))) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Format zod errors into readable messages
 */
function formatZodErrors(error: ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.join('.');
    const itemMatch = path.match(/items\.(\d+)\.(.*)/);

    if (itemMatch) {
      const itemNum = parseInt(itemMatch[1], 10) + 1; // 1-indexed
      const field = itemMatch[2] || 'item';
      return `Item ${itemNum}, ${field}: ${issue.message}`;
    }

    return `${path || 'root'}: ${issue.message}`;
  });
}
