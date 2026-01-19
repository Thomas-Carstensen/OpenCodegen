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

describe('special property names', () => {
  test('quotes property names starting with @', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        '@type': {type: 'string'},
        '@id': {type: 'integer'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('JsonLd', schema, ctx);

    expect(result).toContain("'@type'?: string;");
    expect(result).toContain("'@id'?: number;");
  });

  test('quotes property names starting with numbers', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        '123': {type: 'string'},
        '0value': {type: 'string'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('NumericProps', schema, ctx);

    expect(result).toContain("'123'?: string;");
    expect(result).toContain("'0value'?: string;");
  });

  test('quotes property names with spaces', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        'full name': {type: 'string'},
        'zip code': {type: 'string'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('SpacedProps', schema, ctx);

    expect(result).toContain("'full name'?: string;");
    expect(result).toContain("'zip code'?: string;");
  });

  test('does not quote valid identifiers', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        name: {type: 'string'},
        $ref: {type: 'string'}, // $ is valid at start
        _private: {type: 'string'}, // _ is valid at start
        camelCase: {type: 'string'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('ValidProps', schema, ctx);

    expect(result).toContain('name?: string;');
    expect(result).toContain('$ref?: string;');
    expect(result).toContain('_private?: string;');
    expect(result).toContain('camelCase?: string;');
    expect(result).not.toContain("'name'");
    expect(result).not.toContain("'$ref'");
  });

  test('escapes single quotes in property names', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        "it's": {type: 'string'},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('QuotedProp', schema, ctx);

    expect(result).toContain("'it\\'s'?: string;");
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

  test('handles integer enum values (constObject)', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'constObject'};
    const result = generateEnum('StatusCode', [200, 404, 500], config);

    expect(result).toContain('_200: 200');
    expect(result).toContain('_404: 404');
    expect(result).toContain('_500: 500');
    expect(result).not.toContain("'200'"); // Should not be quoted
  });

  test('handles integer enum values (union)', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'union'};
    const result = generateEnum('StatusCode', [200, 404, 500], config);

    expect(result).toBe('export type StatusCode = 200 | 404 | 500;');
  });

  test('handles integer enum values (enum)', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'enum'};
    const result = generateEnum('StatusCode', [1, 2, 3], config);

    expect(result).toContain('_1 = 1');
    expect(result).toContain('_2 = 2');
    expect(result).toContain('_3 = 3');
  });

  test('handles negative integer enum values', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'constObject'};
    const result = generateEnum('Temperature', [-10, 0, 10], config);

    expect(result).toContain('_Neg10: -10');
    expect(result).toContain('_0: 0');
    expect(result).toContain('_10: 10');
  });

  test('handles mixed string and integer enum values', () => {
    const config: CodegenConfig = {...defaultConfig, enumType: 'union'};
    const result = generateEnum('MixedEnum', ['auto', 0, 100], config);

    expect(result).toBe("export type MixedEnum = 'auto' | 0 | 100;");
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
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
    const ctx = {doc, config, inlineEnums: [], discriminatorLiterals: new Map()};
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
    const ctx = {doc, config, inlineEnums: [], discriminatorLiterals: new Map()};
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
    const ctx = {doc, config, inlineEnums: [], discriminatorLiterals: new Map()};
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
    const ctx = {doc, config, inlineEnums: [], discriminatorLiterals: new Map()};
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('User', schema, ctx);

    expect(result).toContain('status?: UserStatus;');
    expect(ctx.inlineEnums).toHaveLength(1);
    expect(ctx.inlineEnums[0].name).toBe('UserStatus');
    expect(ctx.inlineEnums[0].values).toEqual(['active', 'inactive']);
  });

  test('handles integer enums in properties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        priority: {type: 'integer', enum: [1, 2, 3]},
      },
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Task', schema, ctx);

    expect(result).toContain('priority?: TaskPriority;');
    expect(ctx.inlineEnums).toHaveLength(1);
    expect(ctx.inlineEnums[0].values).toEqual([1, 2, 3]);
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
    const ctx = {doc, config, inlineEnums: [], discriminatorLiterals: new Map()};
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

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Status', schema, ctx);

    expect(result).toContain('export const Status = {');
    expect(result).toContain("Active: 'active'");
  });

  test('generates type alias for non-object schemas', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'string',
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('UserId', schema, ctx);

    expect(result).toBe('export type UserId = string;');
  });

  test('generates empty interface for object without properties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Empty', schema, ctx);

    expect(result).toContain('export interface Empty {}');
  });

  test('generates Record type for pure dictionary (additionalProperties only)', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      additionalProperties: {type: 'string'},
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('StringMap', schema, ctx);

    expect(result).toBe('export type StringMap = Record<string, string>;');
  });

  test('generates Record<string, unknown> for additionalProperties: true', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      additionalProperties: true,
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('AnyMap', schema, ctx);

    expect(result).toBe('export type AnyMap = Record<string, unknown>;');
  });

  test('generates interface with index signature for props + additionalProperties: true', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {type: 'integer'},
      },
      additionalProperties: true,
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('UserData', schema, ctx);

    expect(result).toContain('export interface UserData {');
    expect(result).toContain('id?: number;');
    expect(result).toContain('[key: string]: unknown;');
  });

  test('generates intersection type for props + typed additionalProperties', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {type: 'integer'},
      },
      additionalProperties: {type: 'string'},
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('MixedData', schema, ctx);

    expect(result).toContain('export type MixedData =');
    expect(result).toContain('id?: number;');
    expect(result).toContain('& Record<string, string>');
  });

  test('handles additionalProperties with $ref', () => {
    const doc = createDoc({
      Value: {type: 'object', properties: {data: {type: 'string'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      additionalProperties: {$ref: '#/components/schemas/Value'} as OpenAPIV3.ReferenceObject,
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('ValueMap', schema, ctx);

    expect(result).toBe('export type ValueMap = Record<string, Value>;');
  });

  test('generates interface extends for allOf with single $ref', () => {
    const doc = createDoc({
      Animal: {type: 'object', properties: {name: {type: 'string'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      allOf: [
        {$ref: '#/components/schemas/Animal'} as OpenAPIV3.ReferenceObject,
        {
          type: 'object',
          properties: {
            breed: {type: 'string'},
          },
        },
      ],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Dog', schema, ctx);

    expect(result).toContain('export interface Dog extends Animal {');
    expect(result).toContain('breed?: string;');
  });

  test('generates interface extends with no additional properties', () => {
    const doc = createDoc({
      Animal: {type: 'object', properties: {name: {type: 'string'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      allOf: [{$ref: '#/components/schemas/Animal'} as OpenAPIV3.ReferenceObject],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Pet', schema, ctx);

    expect(result).toBe('export interface Pet extends Animal {}');
  });

  test('generates intersection type for allOf with multiple $refs', () => {
    const doc = createDoc({
      Named: {type: 'object', properties: {name: {type: 'string'}}},
      Aged: {type: 'object', properties: {age: {type: 'integer'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      allOf: [
        {$ref: '#/components/schemas/Named'} as OpenAPIV3.ReferenceObject,
        {$ref: '#/components/schemas/Aged'} as OpenAPIV3.ReferenceObject,
      ],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Person', schema, ctx);

    expect(result).toBe('export type Person = Named & Aged;');
  });

  test('generates union type for oneOf', () => {
    const doc = createDoc({
      Cat: {type: 'object', properties: {meows: {type: 'boolean'}}},
      Dog: {type: 'object', properties: {barks: {type: 'boolean'}}},
    });
    const schema: OpenAPIV3.SchemaObject = {
      oneOf: [
        {$ref: '#/components/schemas/Cat'} as OpenAPIV3.ReferenceObject,
        {$ref: '#/components/schemas/Dog'} as OpenAPIV3.ReferenceObject,
      ],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Pet', schema, ctx);

    expect(result).toBe('export type Pet = Cat | Dog;');
  });

  test('generates union type for anyOf', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      anyOf: [{type: 'string'}, {type: 'integer'}],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('FlexibleId', schema, ctx);

    expect(result).toBe('export type FlexibleId = string | number;');
  });

  test('generates union type for oneOf with inline schemas', () => {
    const doc = createDoc({});
    const schema: OpenAPIV3.SchemaObject = {
      oneOf: [
        {type: 'object', properties: {code: {type: 'string'}}},
        {type: 'object', properties: {id: {type: 'integer'}}},
      ],
    };

    const ctx = {doc, config: defaultConfig, inlineEnums: [], discriminatorLiterals: new Map()};
    const result = generateInterface('Identifier', schema, ctx);

    expect(result).toContain('export type Identifier =');
    expect(result).toContain('code?: string');
    expect(result).toContain('id?: number');
    expect(result).toContain(' | ');
  });
});

describe('discriminator', () => {
  test('generates literal type for discriminator property', () => {
    const doc = createDoc({
      Pet: {
        oneOf: [
          {$ref: '#/components/schemas/Cat'} as OpenAPIV3.ReferenceObject,
          {$ref: '#/components/schemas/Dog'} as OpenAPIV3.ReferenceObject,
        ],
        discriminator: {
          propertyName: 'petType',
          mapping: {
            cat: '#/components/schemas/Cat',
            dog: '#/components/schemas/Dog',
          },
        },
      } as OpenAPIV3.SchemaObject,
      Cat: {
        type: 'object',
        properties: {
          petType: {type: 'string'},
          meows: {type: 'boolean'},
        },
      },
      Dog: {
        type: 'object',
        properties: {
          petType: {type: 'string'},
          barks: {type: 'boolean'},
        },
      },
    });

    const result = generateTypes(doc, defaultConfig);

    // Cat should have petType: 'cat' (literal)
    expect(result).toContain("petType: 'cat'");
    // Dog should have petType: 'dog' (literal)
    expect(result).toContain("petType: 'dog'");
    // Pet should be a union
    expect(result).toContain('export type Pet = Cat | Dog');
  });

  test('uses schema name as default discriminator value when no mapping', () => {
    const doc = createDoc({
      Animal: {
        oneOf: [
          {$ref: '#/components/schemas/Cat'} as OpenAPIV3.ReferenceObject,
        ],
        discriminator: {
          propertyName: 'type',
        },
      } as OpenAPIV3.SchemaObject,
      Cat: {
        type: 'object',
        properties: {
          type: {type: 'string'},
          name: {type: 'string'},
        },
      },
    });

    const result = generateTypes(doc, defaultConfig);

    // Should use lowercase schema name as default
    expect(result).toContain("type: 'cat'");
  });

  test('discriminator property is always required', () => {
    const doc = createDoc({
      Response: {
        oneOf: [
          {$ref: '#/components/schemas/Success'} as OpenAPIV3.ReferenceObject,
        ],
        discriminator: {
          propertyName: 'status',
          mapping: {
            ok: '#/components/schemas/Success',
          },
        },
      } as OpenAPIV3.SchemaObject,
      Success: {
        type: 'object',
        properties: {
          status: {type: 'string'},
          data: {type: 'string'},
        },
        // Note: status is NOT in required array
      },
    });

    const result = generateTypes(doc, defaultConfig);

    // status should NOT have ? (it's the discriminator)
    expect(result).toContain("status: 'ok'");
    expect(result).not.toContain("status?: 'ok'");
    // data should still be optional
    expect(result).toContain('data?: string');
  });
});

describe('circular refs', () => {
  test('handles direct circular reference (Pet → Owner → Pet)', () => {
    const doc = createDoc({
      Pet: {
        type: 'object',
        properties: {
          name: {type: 'string'},
          owner: {$ref: '#/components/schemas/Owner'} as OpenAPIV3.ReferenceObject,
        },
      },
      Owner: {
        type: 'object',
        properties: {
          name: {type: 'string'},
          pets: {
            type: 'array',
            items: {$ref: '#/components/schemas/Pet'} as OpenAPIV3.ReferenceObject,
          },
        },
      },
    });

    // Should not hang or throw - circular refs are handled by returning type names
    const result = generateTypes(doc, defaultConfig);

    expect(result).toContain('export interface Pet {');
    expect(result).toContain('owner?: Owner;');
    expect(result).toContain('export interface Owner {');
    expect(result).toContain('pets?: Pet[];');
  });

  test('handles self-referential schema (Tree with children)', () => {
    const doc = createDoc({
      TreeNode: {
        type: 'object',
        properties: {
          value: {type: 'string'},
          children: {
            type: 'array',
            items: {$ref: '#/components/schemas/TreeNode'} as OpenAPIV3.ReferenceObject,
          },
          parent: {$ref: '#/components/schemas/TreeNode'} as OpenAPIV3.ReferenceObject,
        },
      },
    });

    const result = generateTypes(doc, defaultConfig);

    expect(result).toContain('export interface TreeNode {');
    expect(result).toContain('children?: TreeNode[];');
    expect(result).toContain('parent?: TreeNode;');
  });

  test('handles longer circular chain (A → B → C → A)', () => {
    const doc = createDoc({
      A: {
        type: 'object',
        properties: {
          b: {$ref: '#/components/schemas/B'} as OpenAPIV3.ReferenceObject,
        },
      },
      B: {
        type: 'object',
        properties: {
          c: {$ref: '#/components/schemas/C'} as OpenAPIV3.ReferenceObject,
        },
      },
      C: {
        type: 'object',
        properties: {
          a: {$ref: '#/components/schemas/A'} as OpenAPIV3.ReferenceObject,
        },
      },
    });

    const result = generateTypes(doc, defaultConfig);

    expect(result).toContain('export interface A {');
    expect(result).toContain('b?: B;');
    expect(result).toContain('export interface B {');
    expect(result).toContain('c?: C;');
    expect(result).toContain('export interface C {');
    expect(result).toContain('a?: A;');
  });

  test('handles circular ref in allOf inheritance', () => {
    const doc = createDoc({
      Node: {
        type: 'object',
        properties: {
          id: {type: 'string'},
        },
      },
      LinkedNode: {
        allOf: [
          {$ref: '#/components/schemas/Node'} as OpenAPIV3.ReferenceObject,
          {
            type: 'object',
            properties: {
              next: {$ref: '#/components/schemas/LinkedNode'} as OpenAPIV3.ReferenceObject,
              prev: {$ref: '#/components/schemas/LinkedNode'} as OpenAPIV3.ReferenceObject,
            },
          },
        ],
      },
    });

    const result = generateTypes(doc, defaultConfig);

    expect(result).toContain('export interface LinkedNode extends Node {');
    expect(result).toContain('next?: LinkedNode;');
    expect(result).toContain('prev?: LinkedNode;');
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
