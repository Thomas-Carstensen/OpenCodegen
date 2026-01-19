import {describe, expect, test} from 'bun:test';
import type {OpenAPIV3} from 'openapi-types';
import type {CodegenConfig} from '../../src/config/schema.js';
import {generateEnum, generateInterface, generateTypes, toCamelCase, toPascalCase} from '../../src/codegen/types.js';

// Helper to create a minimal OpenAPI document
const createDoc = (schemas: Record<string, OpenAPIV3.SchemaObject>): OpenAPIV3.Document => ({
  openapi: '3.0.0',
  info: {title: 'Test', version: '1.0.0'},
  paths: {},
  components: {schemas},
});

// Default config for tests
const defaultConfig: CodegenConfig = {
  dateType: 'string',
  enumType: 'constObject',
  propertyNameStyle: 'original',
  nullableType: 'null',
};

describe('toCamelCase', () => {
  test('converts snake_case to camelCase', () => {
    expect(toCamelCase('user_name')).toBe('userName');
    expect(toCamelCase('created_at')).toBe('createdAt');
    expect(toCamelCase('user_id')).toBe('userId');
  });

  test('converts kebab-case to camelCase', () => {
    expect(toCamelCase('user-name')).toBe('userName');
    expect(toCamelCase('created-at')).toBe('createdAt');
  });

  test('handles mixed separators', () => {
    expect(toCamelCase('user_first-name')).toBe('userFirstName');
  });

  test('leaves camelCase unchanged', () => {
    expect(toCamelCase('userName')).toBe('userName');
    expect(toCamelCase('createdAt')).toBe('createdAt');
  });

  test('leaves single words unchanged', () => {
    expect(toCamelCase('name')).toBe('name');
    expect(toCamelCase('id')).toBe('id');
  });
});

describe('toPascalCase', () => {
  test('converts snake_case to PascalCase', () => {
    expect(toPascalCase('user_name')).toBe('UserName');
    expect(toPascalCase('created_at')).toBe('CreatedAt');
  });

  test('converts kebab-case to PascalCase', () => {
    expect(toPascalCase('user-name')).toBe('UserName');
  });

  test('converts camelCase to PascalCase', () => {
    expect(toPascalCase('userName')).toBe('UserName');
  });

  test('capitalizes single words', () => {
    expect(toPascalCase('name')).toBe('Name');
    expect(toPascalCase('active')).toBe('Active');
  });
});

describe('generateEnum', () => {
  const values = ['active', 'inactive', 'pending'];

  test('generates constObject style', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'constObject'};
    const result = generateEnum('Status', values, config);

    expect(result).toContain('export const Status = {');
    expect(result).toContain("Active: 'active'");
    expect(result).toContain("Inactive: 'inactive'");
    expect(result).toContain("Pending: 'pending'");
    expect(result).toContain('} as const;');
    expect(result).toContain('export type Status = typeof Status[keyof typeof Status];');
  });

  test('generates union style', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'union'};
    const result = generateEnum('Status', values, config);

    expect(result).toBe("export type Status = 'active' | 'inactive' | 'pending';");
  });

  test('generates TypeScript enum style', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'enum'};
    const result = generateEnum('Status', values, config);

    expect(result).toContain('export enum Status {');
    expect(result).toContain("Active = 'active'");
    expect(result).toContain("Inactive = 'inactive'");
    expect(result).toContain("Pending = 'pending'");
  });

  test('handles snake_case enum values', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'constObject'};
    const result = generateEnum('Status', ['in_progress', 'not_started'], config);

    expect(result).toContain("InProgress: 'in_progress'");
    expect(result).toContain("NotStarted: 'not_started'");
  });

  test('handles numeric-prefixed values', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'constObject'};
    const result = generateEnum('Code', ['200_ok', '404_not_found'], config);

    // Should prefix with underscore since identifiers can't start with numbers
    expect(result).toContain('_200_ok');
    expect(result).toContain('_404_not_found');
  });
});

describe('generateInterface', () => {
  test('generates interface with primitive properties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {type: 'integer'},
        name: {type: 'string'},
        active: {type: 'boolean'},
        score: {type: 'number'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('export interface User {');
    expect(result).toContain('id?: number;');
    expect(result).toContain('name?: string;');
    expect(result).toContain('active?: boolean;');
    expect(result).toContain('score?: number;');
  });

  test('handles required properties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: {type: 'integer'},
        name: {type: 'string'},
        tag: {type: 'string'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('id: number;');
    expect(result).toContain('name: string;');
    expect(result).toContain('tag?: string;');
  });

  test('handles nullable properties with null type', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        name: {type: 'string', nullable: true},
      },
    };

    const config: CodegenConfig = {...defaultConfig, nullableType: 'null'};
    const ctx = {doc, config, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('name?: string | null;');
  });

  test('handles nullable properties with undefined type', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        name: {type: 'string', nullable: true},
      },
    };

    const config: CodegenConfig = {...defaultConfig, nullableType: 'undefined'};
    const ctx = {doc, config, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('name?: string | undefined;');
  });

  test('handles date formats with string config', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        createdAt: {type: 'string', format: 'date-time'},
        birthday: {type: 'string', format: 'date'},
      },
    };

    const config: CodegenConfig = {...defaultConfig, dateType: 'string'};
    const ctx = {doc, config, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('createdAt?: string;');
    expect(result).toContain('birthday?: string;');
  });

  test('handles date formats with Date config', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        createdAt: {type: 'string', format: 'date-time'},
        birthday: {type: 'string', format: 'date'},
      },
    };

    const config: CodegenConfig = {...defaultConfig, dateType: 'Date'};
    const ctx = {doc, config, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('createdAt?: Date;');
    expect(result).toContain('birthday?: Date;');
  });

  test('handles array properties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        tags: {type: 'array', items: {type: 'string'}},
        scores: {type: 'array', items: {type: 'number'}},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('tags?: string[];');
    expect(result).toContain('scores?: number[];');
  });

  test('handles $ref properties', () => {
    const doc = createDoc({
      Category: {type: 'object', properties: {name: {type: 'string'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        category: {$ref: '#/components/schemas/Category'} as OpenAPIV3.ReferenceObject,
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('Product', schema, ctx);

    expect(result).toContain('category?: Category;');
  });

  test('handles array of $ref', () => {
    const doc = createDoc({
      Tag: {type: 'object', properties: {name: {type: 'string'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        tags: {type: 'array', items: {$ref: '#/components/schemas/Tag'} as OpenAPIV3.ReferenceObject},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('Product', schema, ctx);

    expect(result).toContain('tags?: Tag[];');
  });

  test('extracts inline enums', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        status: {type: 'string', enum: ['active', 'inactive']},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('status?: UserStatus;');
    expect(ctx.inlineEnums).toHaveLength(1);
    expect(ctx.inlineEnums[0].name).toBe('UserStatus');
    expect(ctx.inlineEnums[0].values).toEqual(['active', 'inactive']);
  });

  test('converts property names to camelCase when configured', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        user_name: {type: 'string'},
        created_at: {type: 'string', format: 'date-time'},
      },
    };

    const config: CodegenConfig = {...defaultConfig, propertyNameStyle: 'camelCase'};
    const ctx = {doc, config, inlineEnums: []};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('userName?: string;');
    expect(result).toContain('createdAt?: string;');
    expect(result).not.toContain('user_name');
    expect(result).not.toContain('created_at');
  });

  test('generates top-level enum schema', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'string',
      enum: ['active', 'inactive'],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('Status', schema, ctx);

    expect(result).toContain('export const Status = {');
    expect(result).toContain("Active: 'active'");
  });

  test('generates type alias for non-object schemas', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'string',
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('UserId', schema, ctx);

    expect(result).toBe('export type UserId = string;');
  });

  test('generates empty interface for object without properties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: []};
    const result = generateInterface('Empty', schema, ctx);

    expect(result).toContain('export interface Empty {}');
  });
});

describe('generateTypes', () => {
  test('generates header comment', () => {
    const doc = createDoc({
      User: {type: 'object', properties: {id: {type: 'integer'}}},
    });

    const result = generateTypes(doc, defaultConfig);

    expect(result).toContain('// Generated by OpenCodegen - do not edit manually');
  });

  test('generates multiple interfaces', () => {
    const doc = createDoc({
      User: {type: 'object', properties: {id: {type: 'integer'}}},
      Product: {type: 'object', properties: {name: {type: 'string'}}},
    });

    const result = generateTypes(doc, defaultConfig);

    expect(result).toContain('export interface User {');
    expect(result).toContain('export interface Product {');
  });

  test('generates inline enums before interfaces', () => {
    const doc = createDoc({
      User: {
        type: 'object',
        properties: {
          status: {type: 'string', enum: ['active', 'inactive']},
        },
      },
    });

    const result = generateTypes(doc, defaultConfig);

    // Inline enums should appear before schemas
    const enumIndex = result.indexOf('// Inline enums');
    const schemaIndex = result.indexOf('// Schemas');
    expect(enumIndex).toBeLessThan(schemaIndex);
    expect(result).toContain('UserStatus');
  });

  test('returns comment when no schemas', () => {
    const doc: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {title: 'Test', version: '1.0.0'},
      paths: {},
    };

    const result = generateTypes(doc, {});

    expect(result).toBe('// No schemas found in OpenAPI spec\n');
  });

  test('applies default config values', () => {
    const doc = createDoc({
      User: {
        type: 'object',
        properties: {
          created_at: {type: 'string', format: 'date-time'},
          status: {type: 'string', enum: ['active']},
        },
      },
    });

    // Pass partial config - defaults should be applied
    const result = generateTypes(doc, {});

    // Default dateType is 'string'
    expect(result).toContain('created_at?: string;');
    // Default enumType is 'constObject'
    expect(result).toContain('export const UserStatus = {');
  });
});
