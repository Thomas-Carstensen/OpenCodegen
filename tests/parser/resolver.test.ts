import {describe, expect, test} from 'bun:test';
import type {OpenAPIV3} from 'openapi-types';
import {isRef, resolveIfRef, resolveRef} from '../../src/parser/resolver.js';

// Helper to create a minimal OpenAPI document
const createDoc = (schemas: Record<string, OpenAPIV3.SchemaObject> = {}): OpenAPIV3.Document => ({
  openapi: '3.0.0',
  info: {title: 'Test', version: '1.0.0'},
  paths: {},
  components: {schemas},
});

describe('isRef', () => {
  test('returns true for reference objects', () => {
    expect(isRef({$ref: '#/components/schemas/Pet'})).toBe(true);
  });

  test('returns false for schema objects', () => {
    expect(isRef({type: 'string'})).toBe(false);
    expect(isRef({type: 'object', properties: {}})).toBe(false);
  });

  test('returns false for null', () => {
    expect(isRef(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isRef(undefined)).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(isRef('string')).toBe(false);
    expect(isRef(123)).toBe(false);
    expect(isRef(true)).toBe(false);
  });

  test('returns false when $ref is not a string', () => {
    expect(isRef({$ref: 123})).toBe(false);
    expect(isRef({$ref: null})).toBe(false);
  });
});

describe('resolveRef', () => {
  test('resolves schema reference', () => {
    const doc = createDoc({
      Pet: {type: 'object', properties: {name: {type: 'string'}}},
    });

    const result = resolveRef<OpenAPIV3.SchemaObject>(doc, '#/components/schemas/Pet');

    expect(result.type).toBe('object');
    expect(result.properties?.name).toEqual({type: 'string'});
  });

  test('resolves nested path', () => {
    const doc = createDoc({
      Pet: {type: 'object', properties: {name: {type: 'string'}}},
    });

    const result = resolveRef<OpenAPIV3.SchemaObject>(doc, '#/components/schemas/Pet/properties/name');

    expect(result).toEqual({type: 'string'});
  });

  test('resolves info reference', () => {
    const doc = createDoc({});

    const result = resolveRef<OpenAPIV3.InfoObject>(doc, '#/info');

    expect(result.title).toBe('Test');
    expect(result.version).toBe('1.0.0');
  });

  test('throws for URL references with helpful message', () => {
    const doc = createDoc({});

    expect(() => resolveRef(doc, 'https://example.com/schema.json#/Pet')).toThrow(
      'URL $ref not supported',
    );
  });

  test('throws for relative file references with helpful message', () => {
    const doc = createDoc({});

    expect(() => resolveRef(doc, './common.yaml#/components/schemas/Pet')).toThrow(
      'External file $ref not supported',
    );
  });

  test('throws for non-existent reference', () => {
    const doc = createDoc({});

    expect(() => resolveRef(doc, '#/components/schemas/NonExistent')).toThrow('$ref not found');
  });

  test('throws for invalid path', () => {
    const doc = createDoc({
      Pet: {type: 'string'},
    });

    expect(() => resolveRef(doc, '#/components/schemas/Pet/invalid/path')).toThrow('Invalid $ref path');
  });
});

describe('resolveIfRef', () => {
  test('resolves reference object', () => {
    const doc = createDoc({
      Pet: {type: 'object', properties: {name: {type: 'string'}}},
    });

    const ref: OpenAPIV3.ReferenceObject = {$ref: '#/components/schemas/Pet'};
    const result = resolveIfRef<OpenAPIV3.SchemaObject>(doc, ref);

    expect(result.type).toBe('object');
  });

  test('returns value directly if not a reference', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {type: 'string'};

    const result = resolveIfRef(doc, schema);

    expect(result).toBe(schema);
  });

  test('returns same object reference for non-refs', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {type: 'object', properties: {}};

    const result = resolveIfRef(doc, schema);

    expect(result).toBe(schema); // Same reference, not a copy
  });
});
