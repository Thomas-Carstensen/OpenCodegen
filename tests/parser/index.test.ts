import {describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {getSpecSummary, parseOpenApiSpec} from '../../src/parser/index.js';

// Path to test fixtures
const fixturesDir = join(import.meta.dir, '../fixtures');

describe('parseOpenApiSpec', () => {
  describe('JSON parsing', () => {
    test('parses valid JSON file', async () => {
      const doc = await parseOpenApiSpec(join(fixturesDir, 'petstore.json'));

      expect(doc.openapi).toBe('3.0.0');
      expect(doc.info.title).toBe('Petstore');
      expect(doc.paths).toBeDefined();
    });

    test('throws on invalid JSON', async () => {
      await expect(parseOpenApiSpec(join(fixturesDir, 'invalid.json'))).rejects.toThrow();
    });
  });

  describe('YAML parsing', () => {
    test('parses valid YAML file', async () => {
      const doc = await parseOpenApiSpec(join(fixturesDir, 'petstore.yaml'));

      expect(doc.openapi).toBe('3.0.0');
      expect(doc.info.title).toBe('Petstore');
      expect(doc.paths).toBeDefined();
    });

    test('parses .yml extension', async () => {
      const doc = await parseOpenApiSpec(join(fixturesDir, 'petstore.yml'));

      expect(doc.openapi).toBe('3.0.0');
    });
  });

  describe('validation', () => {
    test('throws for missing openapi version', async () => {
      await expect(parseOpenApiSpec(join(fixturesDir, 'missing-version.json'))).rejects.toThrow(
        'Invalid OpenAPI document',
      );
    });

    test('throws for OpenAPI 2.x (Swagger)', async () => {
      await expect(parseOpenApiSpec(join(fixturesDir, 'swagger-2.json'))).rejects.toThrow(
        'Invalid OpenAPI document',
      );
    });

    test('throws for missing paths', async () => {
      await expect(parseOpenApiSpec(join(fixturesDir, 'missing-paths.json'))).rejects.toThrow(
        'Invalid OpenAPI document',
      );
    });
  });

  describe('format detection', () => {
    test('throws for unsupported extension', async () => {
      await expect(parseOpenApiSpec(join(fixturesDir, 'spec.txt'))).rejects.toThrow(
        'Unsupported file format',
      );
    });

    test('throws for no extension', async () => {
      await expect(parseOpenApiSpec(join(fixturesDir, 'spec'))).rejects.toThrow(
        'Unsupported file format',
      );
    });
  });

  describe('URL parsing', () => {
    test('parses from HTTPS URL', async () => {
      const doc = await parseOpenApiSpec('https://petstore3.swagger.io/api/v3/openapi.json');

      expect(doc.openapi).toMatch(/^3\./);
      expect(doc.info.title).toBeDefined();
      expect(doc.paths).toBeDefined();
    });
  });
});

describe('getSpecSummary', () => {
  test('returns correct summary', async () => {
    const doc = await parseOpenApiSpec(join(fixturesDir, 'petstore.json'));
    const summary = getSpecSummary(doc);

    expect(summary.title).toBe('Petstore');
    expect(summary.version).toBe('1.0.0');
    expect(summary.openApiVersion).toBe('3.0.0');
    expect(summary.pathCount).toBe(2);
    expect(summary.operationCount).toBe(3);
    expect(summary.schemaCount).toBe(2);
  });

  test('handles missing optional fields', async () => {
    const doc = await parseOpenApiSpec(join(fixturesDir, 'minimal.json'));
    const summary = getSpecSummary(doc);

    expect(summary.title).toBe('Minimal');
    expect(summary.schemaCount).toBe(0);
    expect(summary.tags).toEqual([]);
  });
});
