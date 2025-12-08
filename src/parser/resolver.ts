import type {OpenAPIV3} from 'openapi-types';

/**
 * Resolve a $ref pointer to its target in the document.
 * Only handles internal references (starting with #/).
 *
 * @param doc - The OpenAPI document
 * @param ref - The $ref string (e.g., "#/components/schemas/Pet")
 * @returns The resolved object
 */
export const resolveRef = <T>(doc: OpenAPIV3.Document, ref: string): T => {
  if (!ref.startsWith('#/')) {
    throw new Error(`External $ref not supported: ${ref}`);
  }

  const path = ref.slice(2).split('/'); // Remove "#/" and split
  let current: unknown = doc;

  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      throw new Error(`Invalid $ref path: ${ref}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === undefined) {
    throw new Error(`$ref not found: ${ref}`);
  }

  return current as T;
};

/**
 * Check if an object is a reference object.
 */
export const isRef = (obj: unknown): obj is OpenAPIV3.ReferenceObject => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$ref' in obj &&
    typeof (obj as Record<string, unknown>)['$ref'] === 'string'
  );
};

/**
 * Resolve a value that might be a reference or a direct value.
 */
export const resolveIfRef = <T>(doc: OpenAPIV3.Document, value: T | OpenAPIV3.ReferenceObject): T => {
  if (isRef(value)) {
    return resolveRef<T>(doc, value.$ref);
  }
  return value;
};
