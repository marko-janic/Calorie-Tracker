import cokeResponse from './__fixtures__/off/5449000000996.json';
import cokeGramsResponse from './__fixtures__/off/5000112637922.json';
import nutellaJarResponse from './__fixtures__/off/3017620422003.json';
import nutellaServingResponse from './__fixtures__/off/4008400402222.json';
import {
  OffProductSchema,
  defaultPortionSize,
  hasProductData,
  productName,
  productPer100,
  productToFormValues,
  productUnit,
  scaleNutrients
} from './product';
import type { OffProduct, Per100 } from './product';

// Parses a raw OFF `product` the way the lookup does
function parse(raw: unknown): OffProduct {
  return OffProductSchema.parse(raw);
}

function withNutriments(nutriments: Record<string, unknown>): OffProduct {
  return parse({ nutriments });
}

const EMPTY_PER100: Per100 = { unit: 'g', kcal: null, proteinG: null, carbsG: null, fatG: null, fibreG: null };

describe('OffProductSchema', () => {
  it('keeps the fields the app uses', () => {
    const raw = {
      product_name: 'Oat drink',
      brands: 'Oatly',
      quantity: '1 l',
      product_quantity_unit: 'ml',
      serving_quantity: 250,
      serving_quantity_unit: 'ml',
      serving_size: '250 ml',
      nutriments: {
        'energy-kcal_100g': 46,
        energy_100g: 193,
        proteins_100g: 1,
        carbohydrates_100g: 6.7,
        fat_100g: 1.5,
        fiber_100g: 0.8
      }
    };
    expect(parse(raw)).toEqual(raw);
  });

  it('ignores unknown keys', () => {
    const product = parse({
      code: '123',
      product_name: 'Oat drink',
      ecoscore_tags: ['unknown'],
      nutriments: { salt_100g: 0.1, fat_100g: 1.5 }
    });
    expect(product).toEqual({ product_name: 'Oat drink', nutriments: { fat_100g: 1.5 } });
  });

  it('accepts an empty object and a product without nutriments', () => {
    expect(parse({})).toEqual({});
    expect(parse({ product_name: 'Oat drink' }).nutriments).toBeUndefined();
  });

  it('treats null as missing', () => {
    const product = parse({
      product_name: null,
      serving_quantity: null,
      nutriments: null
    });
    expect(product).toEqual({});
    expect(withNutriments({ 'energy-kcal_100g': null, fat_100g: 2 }).nutriments).toEqual({ fat_100g: 2 });
  });

  it('reads numbers that arrive as text', () => {
    const product = parse({
      serving_quantity: '30',
      nutriments: {
        'energy-kcal_100g': '44',
        proteins_100g: '12.5',
        carbohydrates_100g: '12,5',
        fat_100g: ' 3 '
      }
    });
    expect(product.serving_quantity).toBe(30);
    expect(product.nutriments).toEqual({
      'energy-kcal_100g': 44,
      proteins_100g: 12.5,
      carbohydrates_100g: 12.5,
      fat_100g: 3
    });
  });

  it.each([[''], ['  '], ['abc'], ['12 g'], ['1,234.5'], ['-'], [true], [[]], [{}], [NaN], [Infinity]])(
    'treats %j as a missing number',
    (value) => {
      expect(parse({ serving_quantity: value }).serving_quantity).toBeUndefined();
      expect(withNutriments({ fat_100g: value }).nutriments).toEqual({});
    }
  );

  it('treats a number that is too big as missing instead of failing', () => {
    expect(parse({ serving_quantity: '9'.repeat(400) }).serving_quantity).toBeUndefined();
    expect(parse({ serving_quantity: JSON.parse('1e999') }).serving_quantity).toBeUndefined();
  });

  it('trims text fields', () => {
    expect(parse({ product_name: '  Oat drink \n', quantity: ' 1 l ' })).toEqual({
      product_name: 'Oat drink',
      quantity: '1 l'
    });
  });

  it('treats blank and non-text values of text fields as missing', () => {
    const product = parse({
      product_name: '  ',
      brands: '',
      quantity: 330,
      serving_size: {},
      product_quantity_unit: ['ml'],
      serving_quantity_unit: false
    });
    expect(product).toEqual({});
  });

  it('treats nutriments that are not an object as missing', () => {
    for (const nutriments of ['text', 5, [], [{ fat_100g: 1 }]]) {
      expect(parse({ product_name: 'Oat drink', nutriments })).toEqual({ product_name: 'Oat drink' });
    }
  });

  it('does not fail the product because of one unusable field', () => {
    const product = parse({
      product_name: 'Oat drink',
      serving_quantity: 'many',
      nutriments: { 'energy-kcal_100g': 'n/a', proteins_100g: 3 }
    });
    expect(product).toEqual({ product_name: 'Oat drink', nutriments: { proteins_100g: 3 } });
  });

  it.each([[null], [undefined], ['text'], [42], [true], [[]]])('fails for %j, which is not an object', (value) => {
    expect(OffProductSchema.safeParse(value).success).toBe(false);
  });
});

describe('productPer100', () => {
  it('reads the per-100 values of a complete product', () => {
    const product = parse({
      nutriments: {
        'energy-kcal_100g': 539,
        energy_100g: 2252,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        fiber_100g: 3
      }
    });
    expect(productPer100(product)).toEqual({
      unit: 'g',
      kcal: 539,
      proteinG: 6.3,
      carbsG: 57.5,
      fatG: 30.9,
      fibreG: 3
    });
  });

  it('gives null for a nutrient that is missing and keeps a zero', () => {
    const product = withNutriments({ 'energy-kcal_100g': 120, proteins_100g: 0, fat_100g: 4 });
    expect(productPer100(product)).toEqual({
      ...EMPTY_PER100,
      kcal: 120,
      proteinG: 0,
      fatG: 4
    });
  });

  it('converts kJ when there is no kcal value', () => {
    expect(productPer100(withNutriments({ energy_100g: 1046 })).kcal).toBeCloseTo(250, 6);
    const { kcal } = productPer100(withNutriments({ energy_100g: 1000 }));
    expect(kcal).toBeCloseTo(239.0057, 4);
    expect(Number.isInteger(kcal)).toBe(false);
  });

  it('prefers kcal over kJ', () => {
    expect(productPer100(withNutriments({ 'energy-kcal_100g': 100, energy_100g: 1000 })).kcal).toBe(100);
  });

  it('keeps kcal null when there is neither kcal nor kJ', () => {
    expect(productPer100(withNutriments({ fat_100g: 4 })).kcal).toBeNull();
    expect(productPer100(parse({})).kcal).toBeNull();
  });

  it('keeps a zero energy value', () => {
    expect(productPer100(withNutriments({ 'energy-kcal_100g': 0, energy_100g: 5 })).kcal).toBe(0);
    expect(productPer100(withNutriments({ energy_100g: 0 })).kcal).toBe(0);
  });

  it('treats negative values as missing', () => {
    expect(productPer100(withNutriments({ 'energy-kcal_100g': -5, energy_100g: 418.4 })).kcal).toBeCloseTo(100, 6);
    expect(
      productPer100(
        withNutriments({
          'energy-kcal_100g': -5,
          energy_100g: -1,
          proteins_100g: -0.1,
          carbohydrates_100g: '-3',
          fat_100g: -2,
          fiber_100g: -1
        })
      )
    ).toEqual(EMPTY_PER100);
  });

  it('gives only nulls for an empty product', () => {
    expect(productPer100(parse({}))).toEqual(EMPTY_PER100);
  });

  it('does not round the values', () => {
    const product = withNutriments({ 'energy-kcal_100g': 42.1212121212121, carbohydrates_100g: 10.6060606060606 });
    expect(productPer100(product)).toMatchObject({ kcal: 42.1212121212121, carbsG: 10.6060606060606 });
  });

  it('reads values that arrive as text', () => {
    const product = withNutriments({ 'energy-kcal_100g': '44,5', proteins_100g: 'n/a', fat_100g: '' });
    expect(productPer100(product)).toEqual({ ...EMPTY_PER100, kcal: 44.5 });
  });

  it('reports the unit of a liquid as ml', () => {
    const product = parse({ quantity: '330 ml', nutriments: { 'energy-kcal_100g': 44 } });
    expect(productPer100(product)).toEqual({ ...EMPTY_PER100, unit: 'ml', kcal: 44 });
  });
});

describe('productUnit', () => {
  it('takes product_quantity_unit before everything else', () => {
    const product = parse({
      product_quantity_unit: 'ml',
      quantity: '330 g',
      serving_quantity_unit: 'g',
      serving_size: '330 g'
    });
    expect(productUnit(product)).toBe('ml');
  });

  it('takes the unit in the quantity text second', () => {
    const product = parse({ quantity: '330 ml', serving_quantity_unit: 'g', serving_size: '330 g' });
    expect(productUnit(product)).toBe('ml');
  });

  it('takes serving_quantity_unit third', () => {
    expect(productUnit(parse({ serving_quantity_unit: 'ml', serving_size: '30 g' }))).toBe('ml');
  });

  it('takes the unit in the serving_size text last', () => {
    expect(productUnit(parse({ serving_size: '1 portion (330 ml)' }))).toBe('ml');
  });

  it('gives g when no source has a unit', () => {
    expect(productUnit(parse({}))).toBe('g');
    expect(productUnit(parse({ quantity: '12 pieces', serving_size: '1 slice' }))).toBe('g');
  });

  it('skips a source without a known unit', () => {
    const product = parse({
      product_quantity_unit: 'oz',
      quantity: '1 liter',
      serving_quantity_unit: 'fl oz',
      serving_size: '250 ml'
    });
    expect(productUnit(product)).toBe('ml');
  });

  it.each([
    ['g', 'g'],
    ['kg', 'g'],
    ['ml', 'ml'],
    ['cl', 'ml'],
    ['dl', 'ml'],
    ['l', 'ml'],
    ['ML', 'ml'],
    [' Kg ', 'g'],
    ['L ', 'ml']
  ])('reads the unit field %j as %s', (value, unit) => {
    expect(productUnit(parse({ product_quantity_unit: value, serving_quantity_unit: unit === 'g' ? 'ml' : 'g' }))).toBe(unit);
  });

  it.each(['ml foo', 'millilitre', '330 ml', 'liter', '1'])('does not read the unit field %j as a unit', (value) => {
    for (const unit of ['g', 'ml'] as const) {
      expect(productUnit(parse({ product_quantity_unit: value, serving_quantity_unit: unit }))).toBe(unit);
    }
  });

  // The next source has the other unit, so a text that gave no unit would show
  it.each([
    ['330 ml', 'ml'],
    ['500g', 'g'],
    ['400 g e', 'g'],
    ['0.33l', 'ml'],
    ['1,5 L', 'ml'],
    ['6 x 33 cl', 'ml'],
    ['2 DL', 'ml'],
    ['1 kg', 'g'],
    ['1 portion (330 ml)', 'ml'],
    ['13 CHIPS | ABOUT (28 g)', 'g'],
    ['330ml.', 'ml']
  ])('reads the unit in the text %j as %s', (text, unit) => {
    expect(productUnit(parse({ quantity: text, serving_quantity_unit: unit === 'g' ? 'ml' : 'g' }))).toBe(unit);
  });

  it.each(['1 portion (330 ml)', '1 can (33 cl)', '2 dl'])('reads the unit in the serving_size text %j', (text) => {
    expect(productUnit(parse({ serving_size: text }))).toBe('ml');
  });

  it.each(['Large', '1 liter', 'ml 330', '5 gum', 'about 2 lbs', 'g', ''])(
    'finds no unit in the text %j',
    (text) => {
      for (const unit of ['g', 'ml'] as const) {
        expect(productUnit(parse({ quantity: text, serving_quantity_unit: unit }))).toBe(unit);
      }
    }
  );
});

describe('defaultPortionSize', () => {
  it.each<[unknown, number]>([
    [undefined, 100],
    [null, 100],
    [330, 330],
    [15.5, 15.5],
    [0.1, 0.1],
    [10000, 10000],
    [0, 100],
    [0.05, 100],
    [-5, 100],
    [10001, 100],
    [20000, 100],
    ['30', 30],
    ['2,5', 2.5],
    ['', 100],
    ['abc', 100],
    ['20000', 100]
  ])('serving_quantity %j gives %p', (servingQuantity, size) => {
    expect(defaultPortionSize(parse({ serving_quantity: servingQuantity }))).toBe(size);
  });

  it('gives 100 for a product without a serving_quantity', () => {
    expect(defaultPortionSize(parse({ serving_quantity_unit: 'g', serving_size: '1 slice' }))).toBe(100);
  });
});

describe('productName', () => {
  const name = (raw: Record<string, unknown>) => productName(parse(raw));

  it('joins the brand and the product name', () => {
    expect(name({ brands: 'Ferrero', product_name: 'Nutella' })).toBe('Ferrero Nutella');
  });

  it('uses only the first brand', () => {
    expect(name({ brands: 'Brand A, Brand B', product_name: 'Spread' })).toBe('Brand A Spread');
    expect(name({ brands: ', Brand B,Brand C', product_name: 'Spread' })).toBe('Brand B Spread');
  });

  it('gives the brand alone without a product name', () => {
    expect(name({ brands: 'Ferrero, Nutella' })).toBe('Ferrero');
  });

  it('gives the product name alone without a brand', () => {
    expect(name({ product_name: 'Nutella' })).toBe('Nutella');
  });

  it('gives an empty string without both', () => {
    expect(name({})).toBe('');
    expect(name({ brands: ' , ', product_name: '  ' })).toBe('');
  });

  it('does not repeat a brand the product name starts with, ignoring case', () => {
    expect(name({ brands: 'Alpro', product_name: 'alpro Soya Drink' })).toBe('alpro Soya Drink');
    expect(name({ brands: 'Coca-Cola', product_name: 'Coca-Cola Zero' })).toBe('Coca-Cola Zero');
    expect(name({ brands: 'Nutella', product_name: 'Nutella' })).toBe('Nutella');
  });

  it('adds a brand that only appears later in the product name', () => {
    expect(name({ brands: 'Zero', product_name: 'Coca-Cola Zero' })).toBe('Zero Coca-Cola Zero');
  });

  it('trims and collapses whitespace', () => {
    expect(name({ brands: '  Ferrero  ', product_name: ' Nutella \n  Hazelnut   spread ' })).toBe(
      'Ferrero Nutella Hazelnut spread'
    );
  });

  it('cuts the name to 200 characters', () => {
    const long = name({ brands: 'Brand', product_name: 'x'.repeat(300) });
    expect(long).toBe(`Brand ${'x'.repeat(194)}`);
    expect(long).toHaveLength(200);
    expect(name({ product_name: 'x'.repeat(200) })).toHaveLength(200);
    expect(name({ brands: 'b'.repeat(250) })).toBe('b'.repeat(200));
  });

  it('does not end the cut name with a space or half of a surrogate pair', () => {
    expect(name({ product_name: `${'x'.repeat(199)} tail` })).toBe('x'.repeat(199));
    expect(name({ product_name: `${'x'.repeat(199)}\u{1F600}tail` })).toBe('x'.repeat(199));
    expect(name({ product_name: `${'x'.repeat(198)}\u{1F600}tail` })).toBe(`${'x'.repeat(198)}\u{1F600}`);
  });
});

describe('scaleNutrients', () => {
  const nutella: Per100 = { unit: 'g', kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, fibreG: 3 };

  it('scales the per-100 values to the size', () => {
    expect(scaleNutrients(nutella, 15)).toEqual({ kcal: 81, proteinG: 0.9, carbsG: 8.6, fatG: 4.6, fibreG: 0.5 });
    expect(scaleNutrients(nutella, 40)).toEqual({ kcal: 216, proteinG: 2.5, carbsG: 23, fatG: 12.4, fibreG: 1.2 });
    expect(scaleNutrients(nutella, 100)).toEqual({ kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, fibreG: 3 });
  });

  it('rounds kcal to whole numbers and grams to 0.1', () => {
    const per100: Per100 = {
      unit: 'ml',
      kcal: 42.1212121212121,
      proteinG: 0.04,
      carbsG: 10.6060606060606,
      fatG: 0.249,
      fibreG: 0
    };
    expect(scaleNutrients(per100, 100)).toEqual({ kcal: 42, proteinG: 0, carbsG: 10.6, fatG: 0.2, fibreG: 0 });
    expect(scaleNutrients({ ...per100, kcal: 44 }, 330).kcal).toBe(145);
  });

  it('keeps null for an unknown nutrient and 0 for a known zero', () => {
    const per100: Per100 = { ...EMPTY_PER100, proteinG: 5, fatG: 0 };
    expect(scaleNutrients(per100, 40)).toEqual({ kcal: null, proteinG: 2, carbsG: null, fatG: 0, fibreG: null });
  });

  it('returns only the nutrients, not the unit', () => {
    expect(Object.keys(scaleNutrients(nutella, 100)).sort()).toEqual(['carbsG', 'fatG', 'fibreG', 'kcal', 'proteinG']);
  });
});

describe('productToFormValues', () => {
  const nutella = {
    product_name: 'Nutella',
    brands: 'Ferrero',
    serving_quantity: 15,
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      fiber_100g: 3
    }
  };

  it('fills the values for the serving size of the product', () => {
    expect(productToFormValues(parse(nutella))).toEqual({
      name: 'Ferrero Nutella',
      portionSize: 15,
      portionUnit: 'g',
      kcal: 81,
      proteinG: 0.9,
      carbsG: 8.6,
      fatG: 4.6,
      fibreG: 0.5
    });
  });

  it('fills the values for a given size', () => {
    expect(productToFormValues(parse(nutella), 100)).toEqual({
      name: 'Ferrero Nutella',
      portionSize: 100,
      portionUnit: 'g',
      kcal: 539,
      proteinG: 6.3,
      carbsG: 57.5,
      fatG: 30.9,
      fibreG: 3
    });
  });

  it('uses 100 without a serving size', () => {
    expect(productToFormValues(parse({ ...nutella, serving_quantity: undefined }))).toMatchObject({
      portionSize: 100,
      kcal: 539
    });
  });

  it('uses the unit of the product', () => {
    const drink = parse({ product_name: 'Cola', quantity: '330 ml', nutriments: { 'energy-kcal_100g': 44 } });
    expect(productToFormValues(drink, 330)).toMatchObject({ portionSize: 330, portionUnit: 'ml', kcal: 145 });
  });

  it('rounds a kcal value that comes from kJ', () => {
    const product = withNutriments({ energy_100g: 1046 });
    expect(productToFormValues(product, 330).kcal).toBe(825);
  });

  it('leaves unknown values empty', () => {
    expect(productToFormValues(parse({ product_name: 'Mystery bar', nutriments: { fat_100g: 10 } }))).toEqual({
      name: 'Mystery bar',
      portionSize: 100,
      portionUnit: 'g',
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: 10,
      fibreG: null
    });
  });

  it('gives an empty name and empty values for an empty product', () => {
    expect(productToFormValues(parse({}))).toEqual({
      name: '',
      portionSize: 100,
      portionUnit: 'g',
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fibreG: null
    });
  });
});

describe('hasProductData', () => {
  it('is false for a product OFF knows the barcode of but has nothing else on', () => {
    expect(hasProductData(parse({}))).toBe(false);
    expect(hasProductData(parse({ nutriments: {}, quantity: '330 ml', serving_quantity: 330 }))).toBe(false);
  });

  it('is true with a name, a brand or any nutrient value', () => {
    expect(hasProductData(parse({ product_name: 'Oat drink' }))).toBe(true);
    expect(hasProductData(parse({ brands: 'Alpro' }))).toBe(true);
    expect(hasProductData(withNutriments({ proteins_100g: 3.2 }))).toBe(true);
    expect(hasProductData(withNutriments({ energy_100g: 180 }))).toBe(true);
  });
});

describe('real Open Food Facts products', () => {
  it.each([
    ['5449000000996', cokeResponse],
    ['5000112637922', cokeGramsResponse],
    ['3017620422003', nutellaJarResponse],
    ['4008400402222', nutellaServingResponse]
  ])('parses %s', (_code, response) => {
    expect(OffProductSchema.safeParse(response.product).success).toBe(true);
  });

  it('5449000000996: a drink in ml with a serving of 330 ml', () => {
    const product = parse(cokeResponse.product);
    expect(productUnit(product)).toBe('ml');
    expect(defaultPortionSize(product)).toBe(330);
    expect(productPer100(product)).toEqual({
      unit: 'ml',
      kcal: 44,
      proteinG: 0,
      carbsG: 10.9,
      fatG: 0,
      fibreG: null
    });
    expect(productToFormValues(product)).toEqual({
      name: 'COCA-COLA SERVICES SA/NV Coca-Cola Original',
      portionSize: 330,
      portionUnit: 'ml',
      kcal: 145,
      proteinG: 0,
      carbsG: 36,
      fatG: 0,
      fibreG: null
    });
  });

  it('5000112637922: a drink whose serving is listed in g still gives ml', () => {
    const product = parse(cokeGramsResponse.product);
    expect(cokeGramsResponse.product.serving_quantity_unit).toBe('g');
    expect(productUnit(product)).toBe('ml');
    expect(defaultPortionSize(product)).toBe(330);
    expect(productToFormValues(product)).toMatchObject({ portionSize: 330, portionUnit: 'ml', kcal: 139, carbsG: 35 });
  });

  it('3017620422003: a serving unit without a serving size gives g and 100', () => {
    const product = parse(nutellaJarResponse.product);
    expect(nutellaJarResponse.product).toHaveProperty('serving_quantity_unit', 'g');
    expect(nutellaJarResponse.product).not.toHaveProperty('serving_quantity');
    expect(productUnit(product)).toBe('g');
    expect(defaultPortionSize(product)).toBe(100);
    expect(productToFormValues(product)).toEqual({
      name: 'Ferrero Nutella',
      portionSize: 100,
      portionUnit: 'g',
      kcal: 539,
      proteinG: 6.3,
      carbsG: 57.5,
      fatG: 30.9,
      fibreG: 0
    });
  });

  it('4008400402222: a solid with a serving of 15 g', () => {
    const product = parse(nutellaServingResponse.product);
    expect(productUnit(product)).toBe('g');
    expect(defaultPortionSize(product)).toBe(15);
    expect(productToFormValues(product)).toEqual({
      name: 'Ferrero Nutella',
      portionSize: 15,
      portionUnit: 'g',
      kcal: 81,
      proteinG: 0.9,
      carbsG: 8.6,
      fatG: 4.6,
      fibreG: 0.5
    });
  });
});
