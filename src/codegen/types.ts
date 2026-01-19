import type {OpenAPIV3} from 'openapi-types';
import type {CodegenConfig} from '../config/schema.js';
import {isRef, resolveIfRef} from '../parser/resolver.js';

/**
 * Collected inline enum that needs to be generated.
 */
interface InlineEnum {
  name: string;
  values: string[];
}

/**
 * Context for type generation, accumulates inline enums found during processing.
 */
interface GenerationContext {
  doc: OpenAPIV3.Document;
  config: CodegenConfig;
  inlineEnums: InlineEnum[];
}

/**
 * Convert snake_case or kebab-case to camelCase.
 */
export const toCamelCase = (str: string): string => {
  return str.replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
};

/**
 * Convert string to PascalCase.
 */
export const toPascalCase = (str: string): string => {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

/**
 * Convert enum value to a valid identifier for const object keys.
 * e.g., 'active' -> 'Active', 'in_progress' -> 'InProgress'
 */
const enumValueToKey = (value: string): string => {
  // Handle common patterns
  if (/^[a-z_-]+$/i.test(value)) {
    return toPascalCase(value);
  }
  // For other values (numbers, special chars), prefix with underscore if needed
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(cleaned)) {
    return `_${cleaned}`;
  }
  return toPascalCase(cleaned);
};

/**
 * Generate enum as constObject style.
 */
const generateConstObjectEnum = (name: string, values: string[]): string => {
  const entries = values.map((v) => `  ${enumValueToKey(v)}: '${v}'`).join(',\n');
  return `export const ${name} = {\n${entries},\n} as const;\n\nexport type ${name} = typeof ${name}[keyof typeof ${name}];`;
};

/**
 * Generate enum as union type.
 */
const generateUnionEnum = (name: string, values: string[]): string => {
  const union = values.map((v) => `'${v}'`).join(' | ');
  return `export type ${name} = ${union};`;
};

/**
 * Generate enum as TypeScript enum.
 */
const generateTsEnum = (name: string, values: string[]): string => {
  const entries = values.map((v) => `  ${enumValueToKey(v)} = '${v}'`).join(',\n');
  return `export enum ${name} {\n${entries},\n}`;
};

/**
 * Generate enum code based on config.
 */
export const generateEnum = (name: string, values: string[], config: CodegenConfig): string => {
  switch (config.enumType) {
    case 'constObject':
      return generateConstObjectEnum(name, values);
    case 'union':
      return generateUnionEnum(name, values);
    case 'enum':
      return generateTsEnum(name, values);
  }
};

/**
 * Convert an OpenAPI schema to a TypeScript type string.
 * Handles primitives, arrays, refs, and inline objects.
 */
export const schemaToTypeString = (
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ctx: GenerationContext,
  parentName?: string,
  propertyName?: string,
): string => {
  // Handle $ref
  if (isRef(schema)) {
    const refPath = schema.$ref;
    const match = refPath.match(/^#\/components\/schemas\/(.+)$/);
    if (match) {
      return match[1];
    }
    throw new Error(`Unsupported $ref format: ${refPath}`);
  }

  const schemaObj = schema as OpenAPIV3.SchemaObject;

  // Handle enum
  if (schemaObj.enum && Array.isArray(schemaObj.enum)) {
    const values = schemaObj.enum as string[];

    // If this is an inline enum (has parent and property), extract it
    if (parentName && propertyName) {
      const enumName = `${parentName}${toPascalCase(propertyName)}`;
      ctx.inlineEnums.push({name: enumName, values});
      return enumName;
    }

    // For top-level enums without a name, return union directly
    return values.map((v) => `'${v}'`).join(' | ');
  }

  // Handle by type
  switch (schemaObj.type) {
    case 'string':
      // Check for date formats
      if (schemaObj.format === 'date' || schemaObj.format === 'date-time') {
        return ctx.config.dateType;
      }
      return 'string';

    case 'number':
    case 'integer':
      return 'number';

    case 'boolean':
      return 'boolean';

    case 'array':
      if (schemaObj.items) {
        const itemType = schemaToTypeString(schemaObj.items, ctx, parentName, propertyName);
        return `${itemType}[]`;
      }
      return 'unknown[]';

    case 'object':
      // Inline object - generate inline type
      if (schemaObj.properties) {
        const props = generatePropertiesInline(schemaObj, ctx, parentName);
        return `{ ${props} }`;
      }
      // Object without properties
      if (schemaObj.additionalProperties) {
        console.warn(`Warning: additionalProperties not fully supported, using Record<string, unknown>`);
        return 'Record<string, unknown>';
      }
      return 'Record<string, unknown>';

    default:
      // Handle allOf, anyOf, oneOf
      if (schemaObj.allOf) {
        console.warn(`Warning: allOf not supported, using unknown`);
        return 'unknown';
      }
      if (schemaObj.anyOf) {
        console.warn(`Warning: anyOf not supported, using unknown`);
        return 'unknown';
      }
      if (schemaObj.oneOf) {
        console.warn(`Warning: oneOf not supported, using unknown`);
        return 'unknown';
      }

      // No type specified but has properties - treat as object
      if (schemaObj.properties) {
        const props = generatePropertiesInline(schemaObj, ctx, parentName);
        return `{ ${props} }`;
      }

      return 'unknown';
  }
};

/**
 * Generate properties for inline object types.
 */
const generatePropertiesInline = (
  schema: OpenAPIV3.SchemaObject,
  ctx: GenerationContext,
  parentName?: string,
): string => {
  if (!schema.properties) return '';

  const required = new Set(schema.required ?? []);
  const props: string[] = [];

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const resolved = resolveIfRef(ctx.doc, propSchema);
    const isRequired = required.has(propName);
    const isNullable = 'nullable' in resolved && resolved.nullable === true;

    const tsName = ctx.config.propertyNameStyle === 'camelCase' ? toCamelCase(propName) : propName;
    const typeStr = schemaToTypeString(propSchema, ctx, parentName, propName);

    let fullType = typeStr;
    if (isNullable) {
      const nullType = ctx.config.nullableType === 'null' ? 'null' : 'undefined';
      fullType = `${typeStr} | ${nullType}`;
    }

    const optionalMark = isRequired ? '' : '?';
    props.push(`${tsName}${optionalMark}: ${fullType}`);
  }

  return props.join('; ');
};

/**
 * Generate a single interface from a schema.
 */
export const generateInterface = (
  name: string,
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ctx: GenerationContext,
): string => {
  // Handle $ref - just re-export the referenced type
  if (isRef(schema)) {
    const refType = schemaToTypeString(schema, ctx);
    return `export type ${name} = ${refType};`;
  }

  const schemaObj = schema as OpenAPIV3.SchemaObject;

  // Handle enum at top level
  if (schemaObj.enum && Array.isArray(schemaObj.enum)) {
    return generateEnum(name, schemaObj.enum as string[], ctx.config);
  }

  // Handle non-object types at top level
  if (schemaObj.type !== 'object' && !schemaObj.properties) {
    const typeStr = schemaToTypeString(schemaObj, ctx, name);
    return `export type ${name} = ${typeStr};`;
  }

  // Generate interface
  if (!schemaObj.properties) {
    return `export interface ${name} {}\n`;
  }

  const required = new Set(schemaObj.required ?? []);
  const lines: string[] = [`export interface ${name} {`];

  for (const [propName, propSchema] of Object.entries(schemaObj.properties)) {
    const resolved = resolveIfRef(ctx.doc, propSchema);
    const isRequired = required.has(propName);
    const isNullable = 'nullable' in resolved && resolved.nullable === true;

    const tsName = ctx.config.propertyNameStyle === 'camelCase' ? toCamelCase(propName) : propName;
    const typeStr = schemaToTypeString(propSchema, ctx, name, propName);

    let fullType = typeStr;
    if (isNullable) {
      const nullType = ctx.config.nullableType === 'null' ? 'null' : 'undefined';
      fullType = `${typeStr} | ${nullType}`;
    }

    const optionalMark = isRequired ? '' : '?';
    lines.push(`  ${tsName}${optionalMark}: ${fullType};`);
  }

  lines.push('}');
  return lines.join('\n');
};

/**
 * Apply default values to config.
 */
const applyDefaults = (config: Partial<CodegenConfig>): CodegenConfig => ({
  dateType: config.dateType ?? 'string',
  enumType: config.enumType ?? 'constObject',
  propertyNameStyle: config.propertyNameStyle ?? 'original',
  nullableType: config.nullableType ?? 'null',
});

/**
 * Generate all TypeScript types from an OpenAPI document.
 */
export const generateTypes = (doc: OpenAPIV3.Document, config: Partial<CodegenConfig>): string => {
  const schemas = doc.components?.schemas;
  if (!schemas || Object.keys(schemas).length === 0) {
    return '// No schemas found in OpenAPI spec\n';
  }

  const fullConfig = applyDefaults(config);

  const ctx: GenerationContext = {
    doc,
    config: fullConfig,
    inlineEnums: [],
  };

  // First pass: generate all interfaces (this collects inline enums)
  const interfaces: string[] = [];
  for (const [name, schema] of Object.entries(schemas)) {
    interfaces.push(generateInterface(name, schema, ctx));
  }

  // Build output: inline enums first, then interfaces
  const parts: string[] = [];

  parts.push('// Generated by OpenCodegen - do not edit manually');
  parts.push('');

  // Add inline enums
  if (ctx.inlineEnums.length > 0) {
    parts.push('// Inline enums');
    for (const {name, values} of ctx.inlineEnums) {
      parts.push(generateEnum(name, values, fullConfig));
      parts.push('');
    }
  }

  // Add interfaces
  parts.push('// Schemas');
  for (const iface of interfaces) {
    parts.push(iface);
    parts.push('');
  }

  return parts.join('\n');
};
