import appConfig from './app.config';

function build() {
  return appConfig({ config: {} } as Parameters<typeof appConfig>[0]);
}

describe('app.config', () => {
  const original = process.env.KCAL_APP_VARIANT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.KCAL_APP_VARIANT;
    } else {
      process.env.KCAL_APP_VARIANT = original;
    }
  });

  it('keeps the release application ID and label by default', () => {
    delete process.env.KCAL_APP_VARIANT;
    const config = build();
    expect(config.name).toBe('Kcal');
    expect(config.android?.package).toBe('cloud.janic.kcal');
  });

  it('gives pull request builds their own application ID and label', () => {
    process.env.KCAL_APP_VARIANT = 'pr';
    const config = build();
    expect(config.name).toBe('Kcal PR');
    expect(config.android?.package).toBe('cloud.janic.kcal.pr');
  });
});
