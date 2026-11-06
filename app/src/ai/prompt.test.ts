import { buildPrompt } from './prompt';
import { generateJSONSchema } from './schema';

describe('buildPrompt', () => {
  it('includes the JSON Schema', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('JSON Schema:');
    expect(prompt).toContain('"schemaVersion"');
    expect(prompt).toContain('"const": 1');
  });

  it('includes the description when provided', () => {
    const description = 'I had chicken and rice for lunch';
    const prompt = buildPrompt(description);

    expect(prompt).toContain('What I ate:');
    expect(prompt).toContain(description);
  });

  it('has empty description section when not provided', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('What I ate:\n');
  });

  it('includes all rules', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('Reply with exactly one JSON object');
    expect(prompt).toContain('EU food-label convention');
    expect(prompt).toContain('If a value cannot be estimated, use null');
  });
});

describe('generateJSONSchema', () => {
  it('matches the spec from section 10.2', () => {
    const schema = generateJSONSchema();

    // Snapshot test to guard the generated schema output
    // The schema is generated from the zod schema using toJSONSchema
    expect(schema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Kcal AI import v1',
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'items'],
      properties: {
        schemaVersion: { const: 1, type: 'number' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'kcal'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 200 },
              kcal: { type: 'number', minimum: 0, maximum: 10000 },
              protein_g: { type: ['number', 'null'], minimum: 0, maximum: 2000 },
              carbs_g: { type: ['number', 'null'], minimum: 0, maximum: 2000 },
              fat_g: { type: ['number', 'null'], minimum: 0, maximum: 2000 },
              fibre_g: { type: ['number', 'null'], minimum: 0, maximum: 2000 },
              mealType: { enum: ['breakfast', 'lunch', 'dinner', 'snack', null] },
              notes: { type: ['string', 'null'], maxLength: 1000 }
            }
          }
        }
      }
    });
  });
});
