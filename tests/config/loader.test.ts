import {describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {loadConfig} from '../../src/config/loader.js';

// Path to test fixtures
const fixturesDir = join(import.meta.dir, '../fixtures');

describe('loadConfig', () => {
  test('loads TypeScript config file', async () => {
    const config = await loadConfig(join(fixturesDir, 'valid.config.ts'));

    expect(config.source).toBe('./api.yaml');
    expect(config.target).toBe('./generated');
    expect(config.codegen.enumType).toBe('union');
  });

  test('loads JavaScript config file', async () => {
    const config = await loadConfig(join(fixturesDir, 'valid.config.js'));

    expect(config.source).toBe('./api.json');
    expect(config.target).toBe('./output');
  });

  test('loads config with defineConfig helper', async () => {
    const config = await loadConfig(join(fixturesDir, 'with-define-config.ts'));

    expect(config.source).toBeDefined();
    expect(config.target).toBeDefined();
  });

  test('throws for missing default export', async () => {
    await expect(loadConfig(join(fixturesDir, 'no-default-export.ts'))).rejects.toThrow(
      'Config file must have a default export',
    );
  });

  test('throws for non-existent file', async () => {
    await expect(loadConfig(join(fixturesDir, 'non-existent.config.ts'))).rejects.toThrow();
  });
});
