import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {OpenAPIV3} from 'openapi-types';
import type {OpenCodegenConfig} from '../config/schema.js';
import {generateTypes} from './types.js';

export {generateTypes} from './types.js';

/**
 * Map of filename to generated content.
 */
export type GeneratedFiles = Map<string, string>;

/**
 * Generate all code files from an OpenAPI document.
 * Returns a map of filename to content.
 *
 * Phase 3: Only generates types.ts
 * Phase 4: Will add base.ts, client files, index.ts
 */
export const generateCode = (doc: OpenAPIV3.Document, config: OpenCodegenConfig): GeneratedFiles => {
  const files: GeneratedFiles = new Map();

  // Generate types
  const typesContent = generateTypes(doc, config.codegen);
  files.set('types.ts', typesContent);

  return files;
};

/**
 * Write generated files to the target directory.
 * Creates the directory if it doesn't exist.
 */
export const writeGeneratedFiles = async (files: GeneratedFiles, targetDir: string): Promise<void> => {
  // Ensure target directory exists
  await mkdir(targetDir, {recursive: true});

  // Write each file
  for (const [filename, content] of files) {
    const filePath = join(targetDir, filename);
    await writeFile(filePath, content, 'utf-8');
  }
};
