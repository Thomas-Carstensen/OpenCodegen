import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {parse as parseYaml} from 'yaml';
import type {OpenAPIV3} from 'openapi-types';

export type {OpenAPIV3} from 'openapi-types';
export {resolveRef, resolveIfRef, isRef} from './resolver.js';

/**
 * Check if a source is a URL.
 */
const isUrl = (source: string): boolean => {
  return source.startsWith('http://') || source.startsWith('https://');
};

/**
 * Determine format from content-type header or URL/path extension.
 * Throws if format cannot be determined.
 */
const getFormat = (source: string, contentType?: string): 'json' | 'yaml' => {
  // Check content-type header first
  if (contentType) {
    if (contentType.includes('json')) return 'json';
    if (contentType.includes('yaml') || contentType.includes('yml')) return 'yaml';
  }

  // Fall back to extension
  const ext = extname(source).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';

  throw new Error(`Unsupported file format. Expected .json, .yaml, or .yml extension.`);
};

/**
 * Fetch content from a URL.
 */
const fetchContent = async (url: string): Promise<{content: string; contentType?: string}> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  const contentType = response.headers.get('content-type') ?? undefined;

  return {content, contentType};
};

/**
 * Parse content as OpenAPI document.
 */
const parseContent = (content: string, format: 'json' | 'yaml'): unknown => {
  if (format === 'json') {
    return JSON.parse(content);
  }
  return parseYaml(content);
};

/**
 * Parse an OpenAPI specification from a file path or URL.
 * Supports both JSON and YAML formats.
 *
 * @param source - Path to file or URL (http/https)
 * @returns The parsed OpenAPI document
 */
export const parseOpenApiSpec = async (source: string): Promise<OpenAPIV3.Document> => {
  let content: string;
  let contentType: string | undefined;

  if (isUrl(source)) {
    const result = await fetchContent(source);
    content = result.content;
    contentType = result.contentType;
  } else {
    content = readFileSync(source, 'utf-8');
  }

  const format = getFormat(source, contentType);
  const doc = parseContent(content, format);

  if (!isValidOpenApiDoc(doc)) {
    throw new Error('Invalid OpenAPI document: missing openapi version or paths');
  }

  return doc;
};

/**
 * Basic validation that the document looks like an OpenAPI spec.
 */
const isValidOpenApiDoc = (doc: unknown): doc is OpenAPIV3.Document => {
  if (typeof doc !== 'object' || doc === null) {
    return false;
  }

  const obj = doc as Record<string, unknown>;

  // Must have openapi version starting with "3."
  if (typeof obj['openapi'] !== 'string' || !obj['openapi'].startsWith('3.')) {
    return false;
  }

  // Must have paths object
  if (typeof obj['paths'] !== 'object') {
    return false;
  }

  return true;
};

/**
 * Get a summary of the OpenAPI document.
 */
export const getSpecSummary = (doc: OpenAPIV3.Document) => {
  const paths = Object.keys(doc.paths ?? {});
  const schemas = Object.keys(doc.components?.schemas ?? {});
  const tags = doc.tags?.map((t) => t.name) ?? [];

  // Count operations
  let operationCount = 0;
  for (const pathItem of Object.values(doc.paths ?? {})) {
    if (!pathItem) continue;
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
    for (const method of methods) {
      if (pathItem[method]) operationCount++;
    }
  }

  return {
    title: doc.info?.title ?? 'Untitled',
    version: doc.info?.version ?? 'unknown',
    openApiVersion: doc.openapi,
    pathCount: paths.length,
    operationCount,
    schemaCount: schemas.length,
    tags,
  };
};
