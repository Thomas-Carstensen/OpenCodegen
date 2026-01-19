import type {OpenAPIV3} from 'openapi-types';
import type {CodegenConfig} from '../config/schema.js';
import {isRef} from '../parser/resolver.js';
import {toPascalCase, toCamelCase} from './types.js';

/**
 * HTTP methods supported by OpenAPI.
 */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Represents a parsed operation with all relevant info.
 */
interface ParsedOperation {
  method: HttpMethod;
  path: string;
  operationId: string;
  tags: string[];
  parameters: OpenAPIV3.ParameterObject[];
  requestBody?: OpenAPIV3.RequestBodyObject;
  responseType: string;
  hasRequestBody: boolean;
}

/**
 * Represents a generated client class.
 */
interface GeneratedClient {
  tag: string;
  className: string;
  fileName: string;
  operations: ParsedOperation[];
}

/**
 * Extract the type name from a $ref string.
 */
const extractRefName = (ref: string): string | null => {
  const match = ref.match(/^#\/components\/schemas\/(.+)$/);
  return match ? match[1] : null;
};

/**
 * Get the TypeScript type for a schema, returning a type reference string.
 */
const getTypeFromSchema = (
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
  config: CodegenConfig,
): string => {
  if (!schema) return 'unknown';

  if (isRef(schema)) {
    const name = extractRefName(schema.$ref);
    return name ?? 'unknown';
  }

  const schemaObj = schema as OpenAPIV3.SchemaObject;

  // Handle arrays
  if (schemaObj.type === 'array' && schemaObj.items) {
    const itemType = getTypeFromSchema(schemaObj.items, config);
    return `${itemType}[]`;
  }

  // Handle primitives
  switch (schemaObj.type) {
    case 'string':
      if (schemaObj.format === 'date' || schemaObj.format === 'date-time') {
        return config.dateType;
      }
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      // Inline object without ref - use Record
      if (!schemaObj.properties) {
        return 'Record<string, unknown>';
      }
      return 'unknown';
    default:
      return 'unknown';
  }
};

/**
 * Get the response type for an operation.
 */
const getResponseType = (
  responses: OpenAPIV3.ResponsesObject | undefined,
  config: CodegenConfig,
): string => {
  if (!responses) return 'void';

  // Look for success responses (2xx)
  const successCodes = ['200', '201', '202', '203', '204'];
  for (const code of successCodes) {
    const response = responses[code];
    if (!response) continue;

    // Handle $ref to response
    if (isRef(response)) continue; // Skip ref responses for now

    const responseObj = response as OpenAPIV3.ResponseObject;
    const content = responseObj.content;

    if (!content) {
      // No content (e.g., 204 No Content)
      if (code === '204') return 'void';
      continue;
    }

    // Prefer application/json
    const jsonContent = content['application/json'];
    if (jsonContent?.schema) {
      return getTypeFromSchema(jsonContent.schema, config);
    }
  }

  return 'void';
};

/**
 * Get the request body type for an operation.
 */
const getRequestBodyType = (
  requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined,
  config: CodegenConfig,
): string | null => {
  if (!requestBody) return null;

  // Skip ref request bodies for now
  if (isRef(requestBody)) return 'unknown';

  const bodyObj = requestBody as OpenAPIV3.RequestBodyObject;
  const content = bodyObj.content;

  if (!content) return null;

  // Prefer application/json
  const jsonContent = content['application/json'];
  if (jsonContent?.schema) {
    return getTypeFromSchema(jsonContent.schema, config);
  }

  return null;
};

/**
 * Parse all operations from an OpenAPI document.
 */
const parseOperations = (
  doc: OpenAPIV3.Document,
  config: CodegenConfig,
): ParsedOperation[] => {
  const operations: ParsedOperation[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;

    // Get path-level parameters
    const pathParams: OpenAPIV3.ParameterObject[] = [];
    if (pathItem.parameters) {
      for (const param of pathItem.parameters) {
        if (!isRef(param)) {
          pathParams.push(param);
        }
      }
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
      if (!operation) continue;

      // Get operation-level parameters
      const opParams: OpenAPIV3.ParameterObject[] = [...pathParams];
      if (operation.parameters) {
        for (const param of operation.parameters) {
          if (!isRef(param)) {
            opParams.push(param);
          }
        }
      }

      // Generate operationId if not present
      const operationId = operation.operationId ?? `${method}${path.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Get tags (default to 'default' if none)
      const tags = operation.tags ?? ['default'];

      // Get request body
      let requestBody: OpenAPIV3.RequestBodyObject | undefined;
      let hasRequestBody = false;
      if (operation.requestBody && !isRef(operation.requestBody)) {
        requestBody = operation.requestBody;
        hasRequestBody = true;
      }

      // Get response type
      const responseType = getResponseType(operation.responses, config);

      operations.push({
        method,
        path,
        operationId,
        tags,
        parameters: opParams,
        requestBody,
        responseType,
        hasRequestBody,
      });
    }
  }

  return operations;
};

/**
 * Group operations by tag.
 */
const groupOperationsByTag = (operations: ParsedOperation[]): Map<string, ParsedOperation[]> => {
  const groups = new Map<string, ParsedOperation[]>();

  for (const op of operations) {
    // Operations can have multiple tags; add to each
    for (const tag of op.tags) {
      const existing = groups.get(tag) ?? [];
      existing.push(op);
      groups.set(tag, existing);
    }
  }

  return groups;
};

/**
 * Generate parameter type for a method.
 */
const generateParamsType = (params: OpenAPIV3.ParameterObject[], config: CodegenConfig): string | null => {
  const queryParams = params.filter((p) => p.in === 'query');
  if (queryParams.length === 0) return null;

  const props = queryParams.map((p) => {
    const type = p.schema ? getTypeFromSchema(p.schema, config) : 'unknown';
    const name = config.propertyNameStyle === 'camelCase' ? toCamelCase(p.name) : p.name;
    const optional = p.required ? '' : '?';
    return `${name}${optional}: ${type}`;
  });

  return `{ ${props.join('; ')} }`;
};

/**
 * Generate a single method for an operation.
 */
const generateMethod = (op: ParsedOperation, config: CodegenConfig): string => {
  const methodName = op.operationId;

  // Collect path parameters
  const pathParams = op.parameters.filter((p) => p.in === 'path');

  // Build method arguments
  const args: string[] = [];

  // Path parameters first (required)
  for (const param of pathParams) {
    const type = param.schema ? getTypeFromSchema(param.schema, config) : 'unknown';
    const name = config.propertyNameStyle === 'camelCase' ? toCamelCase(param.name) : param.name;
    args.push(`${name}: ${type}`);
  }

  // Request body
  const bodyType = getRequestBodyType(op.requestBody, config);
  if (bodyType) {
    args.push(`body: ${bodyType}`);
  }

  // Query parameters (optional object)
  const paramsType = generateParamsType(op.parameters, config);
  if (paramsType) {
    args.push(`params?: ${paramsType}`);
  }

  // Build path with interpolation
  let pathExpr = op.path;
  for (const param of pathParams) {
    const name = config.propertyNameStyle === 'camelCase' ? toCamelCase(param.name) : param.name;
    pathExpr = pathExpr.replace(`{${param.name}}`, `\${${name}}`);
  }

  // Use template literal if path has parameters
  const pathString = pathParams.length > 0 ? `\`${pathExpr}\`` : `'${op.path}'`;

  // Build request options
  const requestOpts: string[] = [];
  if (paramsType) {
    requestOpts.push('query: params');
  }
  if (bodyType) {
    requestOpts.push('body');
  }

  const optsArg = requestOpts.length > 0 ? `, { ${requestOpts.join(', ')} }` : '';

  // Build method
  const lines: string[] = [
    `  async ${methodName}(${args.join(', ')}): Promise<${op.responseType}> {`,
    `    return this.request<${op.responseType}>('${op.method.toUpperCase()}', ${pathString}${optsArg});`,
    '  }',
  ];

  return lines.join('\n');
};

/**
 * Generate a client class for a tag.
 */
const generateClientClass = (
  tag: string,
  operations: ParsedOperation[],
  config: CodegenConfig,
  typesUsed: Set<string>,
): string => {
  const suffix = config.clientSuffix ?? 'Client';
  const className = `${toPascalCase(tag)}${suffix}`;

  // Generate methods
  const methods = operations.map((op) => generateMethod(op, config));

  // Collect types used in this client
  for (const op of operations) {
    // Response type - extract base type (remove [] suffix)
    if (op.responseType !== 'void' && op.responseType !== 'unknown') {
      const baseType = op.responseType.replace(/\[\]$/, '');
      if (!/^(string|number|boolean|Record<.+>)$/.test(baseType)) {
        typesUsed.add(baseType);
      }
    }

    // Request body type - extract base type (remove [] suffix)
    const bodyType = getRequestBodyType(op.requestBody, config);
    if (bodyType && bodyType !== 'unknown') {
      const baseBodyType = bodyType.replace(/\[\]$/, '');
      typesUsed.add(baseBodyType);
    }
  }

  const lines: string[] = [
    `export class ${className} extends Base${suffix} {`,
    ...methods,
    '}',
  ];

  return lines.join('\n');
};

/**
 * Generate all client files from an OpenAPI document.
 * Returns a map of filename to content.
 */
export const generateClients = (
  doc: OpenAPIV3.Document,
  config: CodegenConfig,
): Map<string, string> => {
  const files = new Map<string, string>();
  const suffix = config.clientSuffix ?? 'Client';

  // Parse all operations
  const operations = parseOperations(doc, config);

  // Group by tag
  const grouped = groupOperationsByTag(operations);

  // Generate client for each tag
  for (const [tag, ops] of grouped) {
    const typesUsed = new Set<string>();
    const clientCode = generateClientClass(tag, ops, config, typesUsed);

    // Build imports
    const imports: string[] = [
      '// Generated by OpenCodegen - do not edit manually',
      '',
      `import { Base${suffix} } from './base.js';`,
    ];

    if (typesUsed.size > 0) {
      const typeImports = Array.from(typesUsed).sort().join(', ');
      imports.push(`import { ${typeImports} } from './types.js';`);
    }

    imports.push('');

    // Build file
    const fileName = `${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}-client.ts`;
    const content = [...imports, clientCode, ''].join('\n');
    files.set(fileName, content);
  }

  return files;
};

/**
 * Get the list of generated client class names for index.ts exports.
 */
export const getClientClassNames = (
  doc: OpenAPIV3.Document,
  config: CodegenConfig,
): string[] => {
  const suffix = config.clientSuffix ?? 'Client';
  const operations = parseOperations(doc, config);
  const grouped = groupOperationsByTag(operations);

  const names: string[] = [];
  for (const tag of grouped.keys()) {
    names.push(`${toPascalCase(tag)}${suffix}`);
  }

  return names.sort();
};

/**
 * Get the list of generated client file names for index.ts exports.
 */
export const getClientFileNames = (doc: OpenAPIV3.Document): string[] => {
  const operations = parseOperations(doc, {} as CodegenConfig);
  const grouped = groupOperationsByTag(operations);

  const names: string[] = [];
  for (const tag of grouped.keys()) {
    names.push(`${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}-client`);
  }

  return names.sort();
};
