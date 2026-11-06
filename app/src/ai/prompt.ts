import { generateJSONSchema } from './schema';

/**
 * Build the AI import prompt.
 *
 * Per section 10.3, this is the built-in prompt (not editable in v1).
 * It includes instructions, the JSON Schema, and the user's description.
 */
export function buildPrompt(description?: string): string {
  const schema = generateJSONSchema();
  const schemaJson = JSON.stringify(schema, null, 2);

  return `You estimate nutrition values for a food diary app.

Estimate the food and drinks described under "What I ate" at the end of this message.

Rules:
1. Reply with exactly one JSON object inside a single \`\`\`json code block. No other text.
2. The JSON must be valid against the JSON Schema below. No comments, no trailing commas.
3. Create one item per distinct food or drink. Put the amount into the name, e.g. "Basmati rice, cooked (150 g)".
4. All values describe the whole amount that was eaten - not per 100 g and not per piece.
5. "kcal" is energy in kilocalories. "protein_g", "carbs_g", "fat_g" and "fibre_g" are grams.
6. "carbs_g" follows the EU food-label convention: available carbohydrates WITHOUT dietary fibre. Put fibre only into "fibre_g".
7. If a value cannot be estimated, use null. Never write 0 for something that contains the nutrient.
8. Round kcal to whole numbers and grams to one decimal place.
9. Set "mealType" only if the description says which meal it was (breakfast, lunch, dinner or snack). Otherwise leave it out.
10. Use "notes" for one short sentence about important assumptions, e.g. "Assumed 1 tbsp olive oil for frying."
11. If no amount is given, assume a typical single portion and say so in "notes".

JSON Schema:
${schemaJson}

What I ate:
${description || ''}`;
}
