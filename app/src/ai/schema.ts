import { z } from 'zod';
import { MealType } from '../domain/types';

/**
 * AI import schema (v1).
 * This defines the JSON structure that AI chats must return.
 */

// Base schemas without strict mode (used for parsing - allows extra keys)
const AIItemSchemaBase = z.object({
  name: z.string().trim().min(1).max(200),
  kcal: z.number().min(0).max(10000),
  protein_g: z.number().min(0).max(2000).nullish(),
  carbs_g: z.number().min(0).max(2000).nullish(),
  fat_g: z.number().min(0).max(2000).nullish(),
  fibre_g: z.number().min(0).max(2000).nullish(),
  mealType: MealType.nullish(),
  notes: z.string().max(1000).nullish()
});

// Strict schemas (used for JSON Schema generation with additionalProperties: false)
export const AIItemSchema = AIItemSchemaBase.strict();

export type AIItem = z.infer<typeof AIItemSchema>;

export const AIImportSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(AIItemSchema).min(1).max(50)
}).strict();

export type AIImport = z.infer<typeof AIImportSchema>;

// Non-strict version for parsing (allows extra keys but validates known fields)
export const AIImportSchemaForParsing = z.object({
  schemaVersion: z.literal(1),
  items: z.array(AIItemSchemaBase).min(1).max(50)
});

/**
 * Convert anyOf patterns to type arrays for better compatibility.
 * Transforms { anyOf: [{ type: "T" }, { type: "null" }] } to { type: ["T", "null"] }
 */
function normalizeNullableTypes(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeNullableTypes);
  }

  // Check if this is a nullable pattern: anyOf with exactly 2 items, one being null
  if (obj.anyOf && Array.isArray(obj.anyOf) && obj.anyOf.length === 2) {
    const types = obj.anyOf.map((item: any) => item.type).filter(Boolean);
    if (types.length === 2 && types.includes('null')) {
      const nonNullType = types.find((t: string) => t !== 'null');
      const nonNullSchema = obj.anyOf.find((item: any) => item.type === nonNullType);

      // If one has enum (like mealType), handle it specially
      if (nonNullSchema?.enum) {
        return {
          enum: [...nonNullSchema.enum, null]
        };
      }

      // Otherwise convert to type array
      const result: any = { type: types };
      // Copy over other properties from the non-null schema
      const sourceSchema = obj.anyOf.find((item: any) => item.type !== 'null');
      for (const key in sourceSchema) {
        if (key !== 'type') {
          result[key] = sourceSchema[key];
        }
      }
      return result;
    }
  }

  // Recursively process all properties
  const result: any = {};
  for (const key in obj) {
    result[key] = normalizeNullableTypes(obj[key]);
  }
  return result;
}

/**
 * Generate JSON Schema for the AI prompt using zod's built-in toJSONSchema().
 */
export function generateJSONSchema(): object {
  const generated = AIImportSchema.toJSONSchema();

  // Normalize nullable types to type arrays as per section 10.2
  const normalized = normalizeNullableTypes(generated);

  // Add title to match the spec from section 10.2
  return {
    ...normalized,
    title: 'Kcal AI import v1'
  };
}
