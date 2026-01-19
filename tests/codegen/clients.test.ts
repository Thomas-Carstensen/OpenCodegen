import {describe, expect, test} from 'bun:test';
import type {OpenAPIV3} from 'openapi-types';
import type {CodegenConfig} from '../../src/config/schema.js';
import {generateClients, getClientClassNames, getClientFileNames} from '../../src/codegen/clients.js';

// Helper to create a minimal OpenAPI document
const createDoc = (
  paths: OpenAPIV3.PathsObject,
  schemas: Record<string, OpenAPIV3.SchemaObject> = {},
): OpenAPIV3.Document => ({
  openapi: '3.0.0',
  info: {title: 'Test', version: '1.0.0'},
  paths,
  components: {schemas},
});

const defaultConfig: CodegenConfig = {
  dateType: 'string',
  enumType: 'constObject',
  propertyNameStyle: 'original',
  nullableType: 'null',
};

describe('generateClients', () => {
  test('generates client class per tag', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
      },
      '/users': {
        get: {
          tags: ['users'],
          operationId: 'listUsers',
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);

    expect(files.has('pets-client.ts')).toBe(true);
    expect(files.has('users-client.ts')).toBe(true);
  });

  test('uses Client suffix by default', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('export class PetsClient extends BaseClient');
  });

  test('uses Api suffix when configured', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const config: CodegenConfig = {...defaultConfig, clientSuffix: 'Api'};
    const files = generateClients(doc, config);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('export class PetsApi extends BaseApi');
  });

  test('generates method from operationId', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
        post: {
          tags: ['pets'],
          operationId: 'createPet',
          responses: {'201': {description: 'Created'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('async listPets(requestOptions?:');
    expect(content).toContain('async createPet(requestOptions?:');
  });

  test('handles path parameters', () => {
    const doc = createDoc({
      '/pets/{petId}': {
        get: {
          tags: ['pets'],
          operationId: 'getPet',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              required: true,
              schema: {type: 'integer'},
            },
          ],
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('async getPet(petId: number, requestOptions?:');
    expect(content).toContain('`/pets/${petId}`');
  });

  test('handles query parameters', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: {type: 'integer'},
            },
            {
              name: 'offset',
              in: 'query',
              schema: {type: 'integer'},
            },
          ],
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('params?: { limit?: number; offset?: number }');
    expect(content).toContain('query: params');
  });

  test('handles request body', () => {
    const doc = createDoc(
      {
        '/pets': {
          post: {
            tags: ['pets'],
            operationId: 'createPet',
            requestBody: {
              content: {
                'application/json': {
                  schema: {$ref: '#/components/schemas/Pet'},
                },
              },
            },
            responses: {'201': {description: 'Created'}},
          },
        },
      },
      {Pet: {type: 'object', properties: {name: {type: 'string'}}}},
    );

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('async createPet(body: Pet, requestOptions?:');
    expect(content).toContain('{ body, headers: requestOptions?.headers }');
  });

  test('extracts response type from 200 response', () => {
    const doc = createDoc(
      {
        '/pets': {
          get: {
            tags: ['pets'],
            operationId: 'listPets',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {$ref: '#/components/schemas/Pet'},
                    },
                  },
                },
              },
            },
          },
        },
      },
      {Pet: {type: 'object', properties: {name: {type: 'string'}}}},
    );

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('Promise<Pet[]>');
    expect(content).toContain("import { Pet } from './types.js'");
  });

  test('uses void for 204 No Content', () => {
    const doc = createDoc({
      '/pets/{petId}': {
        delete: {
          tags: ['pets'],
          operationId: 'deletePet',
          parameters: [{name: 'petId', in: 'path', required: true, schema: {type: 'integer'}}],
          responses: {
            '204': {description: 'No Content'},
          },
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('Promise<void>');
  });

  test('uses default tag when none specified', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);

    expect(files.has('default-client.ts')).toBe(true);
  });

  test('imports types used in client', () => {
    const doc = createDoc(
      {
        '/pets': {
          get: {
            tags: ['pets'],
            operationId: 'listPets',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {type: 'array', items: {$ref: '#/components/schemas/Pet'}},
                  },
                },
              },
            },
          },
          post: {
            tags: ['pets'],
            operationId: 'createPet',
            requestBody: {
              content: {
                'application/json': {
                  schema: {$ref: '#/components/schemas/CreatePetRequest'},
                },
              },
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/Pet'},
                  },
                },
              },
            },
          },
        },
      },
      {
        Pet: {type: 'object', properties: {name: {type: 'string'}}},
        CreatePetRequest: {type: 'object', properties: {name: {type: 'string'}}},
      },
    );

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain("import { CreatePetRequest, Pet } from './types.js'");
  });

  test('includes generated header comment', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('// Generated by OpenCodegen - do not edit manually');
  });

  test('all methods support per-request headers', () => {
    const doc = createDoc({
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          responses: {'200': {description: 'OK'}},
        },
      },
    });

    const files = generateClients(doc, defaultConfig);
    const content = files.get('pets-client.ts')!;

    expect(content).toContain('requestOptions?: { headers?: Record<string, string> }');
    expect(content).toContain('headers: requestOptions?.headers');
  });
});

describe('getClientClassNames', () => {
  test('returns class names for all tags', () => {
    const doc = createDoc({
      '/pets': {
        get: {tags: ['pets'], operationId: 'listPets', responses: {'200': {description: 'OK'}}},
      },
      '/users': {
        get: {tags: ['users'], operationId: 'listUsers', responses: {'200': {description: 'OK'}}},
      },
    });

    const names = getClientClassNames(doc, defaultConfig);

    expect(names).toContain('PetsClient');
    expect(names).toContain('UsersClient');
  });

  test('uses configured suffix', () => {
    const doc = createDoc({
      '/pets': {
        get: {tags: ['pets'], operationId: 'listPets', responses: {'200': {description: 'OK'}}},
      },
    });

    const config: CodegenConfig = {...defaultConfig, clientSuffix: 'Api'};
    const names = getClientClassNames(doc, config);

    expect(names).toContain('PetsApi');
  });
});

describe('getClientFileNames', () => {
  test('returns file names for all tags', () => {
    const doc = createDoc({
      '/pets': {
        get: {tags: ['pets'], operationId: 'listPets', responses: {'200': {description: 'OK'}}},
      },
      '/users': {
        get: {tags: ['users'], operationId: 'listUsers', responses: {'200': {description: 'OK'}}},
      },
    });

    const names = getClientFileNames(doc);

    expect(names).toContain('pets-client');
    expect(names).toContain('users-client');
  });
});
