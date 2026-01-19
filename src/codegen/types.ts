import type {OpenAPIV3} from 'openapi-types';
import type {CodegenConfig} from '../config/schema.js';
import {isRef, resolveIfRef} from '../parser/resolver.js';

/**
 * Collected inline enum that needs to be generated.
 */
interface InlineEnum {
  name: string;
  values: (string | number)[];
}

/**
 * Discriminator literal info - maps schema to its discriminator property and literal value.
 */
interface DiscriminatorLiteral {
  property: string;
  value: string;
}

/**
 * Context for type generation, accumulates inline enums found during processing.
 */
interface GenerationContext {
  doc: OpenAPIV3.Document;
  config: CodegenConfig;
  inlineEnums: InlineEnum[];
  /** Maps schema name to its discriminator literal info */
  discriminatorLiterals: Map<string, DiscriminatorLiteral>;
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
 * Check if a string is a valid JavaScript/TypeScript identifier.
 * Valid identifiers start with a letter, underscore, or dollar sign,
 * and contain only letters, digits, underscores, or dollar signs.
 */
const isValidIdentifier = (str: string): boolean => {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
};

/**
 * Format a property name for TypeScript output.
 * Quotes the name if it's not a valid identifier.
 */
export const formatPropertyName = (name: string): string => {
  if (isValidIdentifier(name)) {
    return name;
  }
  // Quote the property name, escaping any single quotes inside
  return `'${name.replace(/'/g, "\\'")}'`;
};

/**
 * Convert enum value to a valid identifier for const object keys.
 * e.g., 'active' -> 'Active', 'in_progress' -> 'InProgress', 1 -> '_1'
 */
const enumValueToKey = (value: string | number): string => {
  const strValue = String(value);

  // Handle pure numbers - prefix with underscore
  if (typeof value === 'number' || /^-?\d+$/.test(strValue)) {
    return `_${strValue.replace('-', 'Neg')}`;
  }

  // Handle common patterns
  if (/^[a-z_-]+$/i.test(strValue)) {
    return toPascalCase(strValue);
  }

  // For other values (special chars), clean and convert
  const cleaned = strValue.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(cleaned)) {
    return `_${cleaned}`;
  }
  return toPascalCase(cleaned);
};

/**
 * Format an enum value for TypeScript output.
 * Strings are quoted, numbers are not.
 */
const formatEnumValue = (value: string | number): string => {
  if (typeof value === 'number') {
    return String(value);
  }
  return `'${value}'`;
};

/**
 * Generate enum as constObject style.
 */
const generateConstObjectEnum = (name: string, values: (string | number)[]): string => {
  const entries = values.map((v) => `  ${enumValueToKey(v)}: ${formatEnumValue(v)}`).join(',\n');
  return `export const ${name} = {\n${entries},\n} as const;\n\nexport type ${name} = typeof ${name}[keyof typeof ${name}];`;
};

/**
 * Generate enum as union type.
 */
const generateUnionEnum = (name: string, values: (string | number)[]): string => {
  const union = values.map((v) => formatEnumValue(v)).join(' | ');
  return `export type ${name} = ${union};`;
};

/**
 * Generate enum as TypeScript enum.
 */
const generateTsEnum = (name: string, values: (string | number)[]): string => {
  const entries = values.map((v) => `  ${enumValueToKey(v)} = ${formatEnumValue(v)}`).join(',\n');
  return `export enum ${name} {\n${entries},\n}`;
};

/**
 * Generate enum code based on config.
 */
export const generateEnum = (name: string, values: (string | number)[], config: CodegenConfig): string => {
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
    const values = schemaObj.enum as (string | number)[];

    // If this is an inline enum (has parent and property), extract it
    if (parentName && propertyName) {
      const enumName = `${parentName}${toPascalCase(propertyName)}`;
      ctx.inlineEnums.push({name: enumName, values});
      return enumName;
    }

    // For top-level enums without a name, return union directly
    return values.map((v) => formatEnumValue(v)).join(' | ');
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
      return handleObjectType(schemaObj, ctx, parentName);

    default:
      // Handle allOf
      if (schemaObj.allOf) {
        return handleAllOf(schemaObj.allOf, ctx);
      }

      // Handle anyOf, oneOf - both become union types
      if (schemaObj.anyOf) {
        return handleUnionType(schemaObj.anyOf, ctx);
      }
      if (schemaObj.oneOf) {
        return handleUnionType(schemaObj.oneOf, ctx);
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
 * Handle allOf schema composition - returns intersection type for inline use.
 */
const handleAllOf = (
  allOf: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ctx: GenerationContext,
): string => {
  const parts: string[] = [];

  for (const schema of allOf) {
    if (isRef(schema)) {
      parts.push(schemaToTypeString(schema, ctx));
    } else {
      // Inline schema - generate inline type
      const typeStr = schemaToTypeString(schema, ctx);
      parts.push(typeStr);
    }
  }

  return parts.join(' & ');
};

/**
 * Handle oneOf/anyOf - returns union type.
 */
const handleUnionType = (
  schemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ctx: GenerationContext,
): string => {
  const parts: string[] = [];

  for (const schema of schemas) {
    parts.push(schemaToTypeString(schema, ctx));
  }

  return parts.join(' | ');
};

/**
 * Generate interface for allOf schema (inheritance pattern).
 * Uses "extends" for single $ref, intersection for multiple.
 */
const generateAllOfInterface = (
  name: string,
  allOf: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ctx: GenerationContext,
): string => {
  // Separate refs from inline schemas
  const refs: string[] = [];
  const inlineSchemas: OpenAPIV3.SchemaObject[] = [];

  for (const schema of allOf) {
    if (isRef(schema)) {
      const match = schema.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) {
        refs.push(match[1]);
      }
    } else {
      inlineSchemas.push(schema);
    }
  }

  // Single ref + inline properties = interface extends (common C# inheritance pattern)
  if (refs.length === 1 && inlineSchemas.length <= 1) {
    const baseType = refs[0];
    const inlineSchema = inlineSchemas[0];

    // Merge properties from inline schema
    const properties = inlineSchema?.properties ?? {};

    if (Object.keys(properties).length === 0) {
      // No additional properties, just extend
      return `export interface ${name} extends ${baseType} {}`;
    }

    const props = generateProperties(inlineSchema!, ctx, name);
    const lines: string[] = [`export interface ${name} extends ${baseType} {`];
    for (const prop of props) {
      lines.push(`  ${prop};`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  // Multiple refs or complex case - use intersection type
  if (refs.length > 1) {
    console.warn(`Warning: ${name} uses multiple $refs in allOf, using intersection type`);
  }

  const intersectionType = handleAllOf(allOf, ctx);
  return `export type ${name} = ${intersectionType};`;
};

/**
 * Options for generating a single property.
 */
interface PropertyOptions {
  propName: string;
  propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
  isRequired: boolean;
  ctx: GenerationContext;
  parentName?: string;
  /** Override type string (e.g., for discriminator literals) */
  overrideType?: string;
  /** Force required even if not in required array (e.g., for discriminators) */
  forceRequired?: boolean;
}

/**
 * Generate a single property declaration.
 * Returns the property as a string like "name?: string" or "'@type': string".
 */
const generateProperty = (opts: PropertyOptions): string => {
  const {propName, propSchema, isRequired, ctx, parentName, overrideType, forceRequired} = opts;

  const resolved = resolveIfRef(ctx.doc, propSchema);
  const isNullable = 'nullable' in resolved && resolved.nullable === true;

  // Format property name (quote if needed, apply camelCase if configured)
  const baseName = ctx.config.propertyNameStyle === 'camelCase' ? toCamelCase(propName) : propName;
  const tsName = formatPropertyName(baseName);

  // Get type string
  const typeStr = overrideType ?? schemaToTypeString(propSchema, ctx, parentName, propName);

  // Build full type with nullable
  let fullType = typeStr;
  if (isNullable && !overrideType) {
    const nullType = ctx.config.nullableType === 'null' ? 'null' : 'undefined';
    fullType = `${typeStr} | ${nullType}`;
  }

  // Determine if optional
  const isActuallyRequired = forceRequired || isRequired;
  const optionalMark = isActuallyRequired ? '' : '?';

  return `${tsName}${optionalMark}: ${fullType}`;
};

/**
 * Generate properties for an object schema.
 * Returns array of property strings.
 */
const generateProperties = (
  schema: OpenAPIV3.SchemaObject,
  ctx: GenerationContext,
  parentName?: string,
): string[] => {
  if (!schema.properties) return [];

  const required = new Set(schema.required ?? []);
  const discriminatorInfo = parentName ? ctx.discriminatorLiterals.get(parentName) : undefined;

  const props: string[] = [];
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    // Check if this is a discriminator property
    const isDiscriminator = discriminatorInfo && propName === discriminatorInfo.property;

    props.push(
      generateProperty({
        propName,
        propSchema,
        isRequired: required.has(propName),
        ctx,
        parentName,
        overrideType: isDiscriminator ? `'${discriminatorInfo.value}'` : undefined,
        forceRequired: isDiscriminator,
      }),
    );
  }

  return props;
};

/**
 * Get the TypeScript type for additionalProperties.
 */
const getAdditionalPropertiesType = (
  additionalProps: OpenAPIV3.SchemaObject['additionalProperties'],
  ctx: GenerationContext,
): string => {
  if (additionalProps === true) {
    return 'unknown';
  }
  if (typeof additionalProps === 'object') {
    return schemaToTypeString(additionalProps, ctx);
  }
  return 'unknown';
};

/**
 * Handle object type schemas, including additionalProperties.
 */
const handleObjectType = (
  schema: OpenAPIV3.SchemaObject,
  ctx: GenerationContext,
  parentName?: string,
): string => {
  const hasProperties = schema.properties && Object.keys(schema.properties).length > 0;
  const hasAdditionalProps = schema.additionalProperties !== undefined && schema.additionalProperties !== false;

  // Pure dictionary - no fixed properties
  if (!hasProperties && hasAdditionalProps) {
    const valueType = getAdditionalPropertiesType(schema.additionalProperties, ctx);
    return `Record<string, ${valueType}>`;
  }

  // Object with fixed properties
  if (hasProperties) {
    const props = generatePropertiesInline(schema, ctx, parentName);

    // Mixed: fixed properties + additionalProperties
    if (hasAdditionalProps) {
      const valueType = getAdditionalPropertiesType(schema.additionalProperties, ctx);
      if (valueType === 'unknown') {
        // additionalProperties: true - add index signature
        return `{ ${props}; [key: string]: unknown }`;
      } else {
        // Typed additionalProperties - use intersection (warn about potential issues)
        console.warn(`Warning: Mixed properties with typed additionalProperties may have type conflicts`);
        return `{ ${props} } & Record<string, ${valueType}>`;
      }
    }

    return `{ ${props} }`;
  }

  // Empty object
  return 'Record<string, unknown>';
};

/**
 * Generate properties for inline object types (semicolon-separated).
 */
const generatePropertiesInline = (
  schema: OpenAPIV3.SchemaObject,
  ctx: GenerationContext,
  parentName?: string,
): string => {
  return generateProperties(schema, ctx, parentName).join('; ');
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
    return generateEnum(name, schemaObj.enum as (string | number)[], ctx.config);
  }

  // Handle allOf (inheritance)
  if (schemaObj.allOf) {
    return generateAllOfInterface(name, schemaObj.allOf, ctx);
  }

  // Handle oneOf/anyOf (union types)
  if (schemaObj.oneOf) {
    const unionType = handleUnionType(schemaObj.oneOf, ctx);
    return `export type ${name} = ${unionType};`;
  }
  if (schemaObj.anyOf) {
    const unionType = handleUnionType(schemaObj.anyOf, ctx);
    return `export type ${name} = ${unionType};`;
  }

  // Handle non-object types at top level
  if (schemaObj.type !== 'object' && !schemaObj.properties) {
    const typeStr = schemaToTypeString(schemaObj, ctx, name);
    return `export type ${name} = ${typeStr};`;
  }

  const hasProperties = schemaObj.properties && Object.keys(schemaObj.properties).length > 0;
  const hasAdditionalProps = schemaObj.additionalProperties !== undefined && schemaObj.additionalProperties !== false;

  // Pure dictionary - no fixed properties, just additionalProperties
  if (!hasProperties && hasAdditionalProps) {
    const valueType = getAdditionalPropertiesType(schemaObj.additionalProperties, ctx);
    return `export type ${name} = Record<string, ${valueType}>;`;
  }

  // Empty object without properties
  if (!hasProperties) {
    return `export interface ${name} {}`;
  }

  // Object with fixed properties
  const props = generateProperties(schemaObj, ctx, name);
  const lines: string[] = [`export interface ${name} {`];

  for (const prop of props) {
    lines.push(`  ${prop};`);
  }

  // Handle additionalProperties with fixed properties
  if (hasAdditionalProps) {
    const valueType = getAdditionalPropertiesType(schemaObj.additionalProperties, ctx);
    if (valueType === 'unknown') {
      // additionalProperties: true - add index signature
      lines.push(`  [key: string]: unknown;`);
    } else {
      // Typed additionalProperties - can't use interface, fall back to type
      console.warn(`Warning: ${name} has mixed properties with typed additionalProperties, using intersection type`);
      const propsBlock = props.map((p) => `  ${p};`).join('\n');
      return `export type ${name} = {\n${propsBlock}\n} & Record<string, ${valueType}>;`;
    }
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
 * Collect discriminator literals from schemas with oneOf/anyOf + discriminator.
 * Maps each variant schema to its discriminator property and literal value.
 */
const collectDiscriminatorLiterals = (
  schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>,
): Map<string, DiscriminatorLiteral> => {
  const literals = new Map<string, DiscriminatorLiteral>();

  for (const [_name, schema] of Object.entries(schemas)) {
    if (isRef(schema)) continue;

    const schemaObj = schema as OpenAPIV3.SchemaObject;
    const variants = schemaObj.oneOf ?? schemaObj.anyOf;
    const discriminator = schemaObj.discriminator;

    if (!variants || !discriminator?.propertyName) continue;

    const propertyName = discriminator.propertyName;
    const mapping = discriminator.mapping ?? {};

    // Build reverse mapping: schema name -> discriminator value
    const reverseMapping = new Map<string, string>();
    for (const [value, ref] of Object.entries(mapping)) {
      const match = ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) {
        reverseMapping.set(match[1], value);
      }
    }

    // Process each variant
    for (const variant of variants) {
      if (!isRef(variant)) continue;

      const match = variant.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (!match) continue;

      const schemaName = match[1];
      // Use mapping if available, otherwise use schema name in lowercase
      const literalValue = reverseMapping.get(schemaName) ?? schemaName.toLowerCase();

      literals.set(schemaName, {
        property: propertyName,
        value: literalValue,
      });
    }
  }

  return literals;
};

/**
 * Generate all TypeScript types from an OpenAPI document.
 */
export const generateTypes = (doc: OpenAPIV3.Document, config: Partial<CodegenConfig>): string => {
  const schemas = doc.components?.schemas;
  if (!schemas || Object.keys(schemas).length === 0) {
    return '// No schemas found in OpenAPI spec\n';
  }

  const fullConfig = applyDefaults(config);

  // Collect discriminator literals before generating interfaces
  const discriminatorLiterals = collectDiscriminatorLiterals(schemas);

  const ctx: GenerationContext = {
    doc,
    config: fullConfig,
    inlineEnums: [],
    discriminatorLiterals,
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
