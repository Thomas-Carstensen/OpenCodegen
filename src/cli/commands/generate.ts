import chalk from 'chalk';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {generateCode, writeGeneratedFiles} from '../../codegen/index.js';
import {loadConfig} from '../../config/loader.js';
import {getSpecSummary, parseOpenApiSpec} from '../../parser/index.js';

export interface GenerateOptions {
  config?: string;
  verbose?: boolean;
}

/**
 * Print an error message and exit.
 * Throws after exit to help TypeScript understand control flow.
 */
const exitWithError = (message: string, hint?: string): never => {
  console.error(chalk.red(`Error: ${message}`));
  if (hint) {
    console.error(chalk.dim(hint));
  }
  process.exit(1);
  throw new Error(message); // Never reached, but helps TypeScript
};

/**
 * Extract error message from unknown error.
 */
const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export const generate = async (options: GenerateOptions): Promise<void> => {
  const configPath = resolve(options.config ?? 'opencodegen.config.ts');
  const verbose = options.verbose ?? false;

  // Check config file exists
  if (!existsSync(configPath)) {
    exitWithError(
      `Config file not found: ${configPath}`,
      'Create an opencodegen.config.ts file or specify one with --config',
    );
  }

  // Load config
  if (verbose) {
    console.log(chalk.dim(`Loading config from ${configPath}`));
  }

  let config;
  try {
    config = await loadConfig(configPath);
  } catch (error) {
    throw exitWithError(`Failed to load config: ${getErrorMessage(error)}`);
  }

  if (verbose) {
    console.log(chalk.yellow('Configuration:'));
    console.log(`  Source: ${chalk.cyan(config.source)}`);
    console.log(`  Target: ${chalk.cyan(config.target)}`);
    console.log(`  Date type: ${chalk.cyan(config.codegen.dateType)}`);
    console.log(`  Enum type: ${chalk.cyan(config.codegen.enumType)}`);
    console.log();
  }

  // Determine source - URL or file path
  const isUrl = config.source.startsWith('http://') || config.source.startsWith('https://');
  const source = isUrl ? config.source : resolve(configPath, '..', config.source);

  // Check file exists (only for local files)
  if (!isUrl && !existsSync(source)) {
    exitWithError(`OpenAPI spec not found: ${source}`);
  }

  // Parse OpenAPI spec
  if (verbose) {
    console.log(chalk.dim(`Parsing OpenAPI spec from ${source}`));
  }

  let doc;
  try {
    doc = await parseOpenApiSpec(source);
  } catch (error) {
    throw exitWithError(`Failed to parse OpenAPI spec: ${getErrorMessage(error)}`);
  }

  const summary = getSpecSummary(doc);

  console.log(chalk.green(`Parsed: ${summary.title} v${summary.version}`));
  console.log(`  OpenAPI: ${summary.openApiVersion}`);
  console.log(`  Paths: ${summary.pathCount}`);
  console.log(`  Operations: ${summary.operationCount}`);
  console.log(`  Schemas: ${summary.schemaCount}`);
  if (summary.tags.length > 0) {
    console.log(`  Tags: ${summary.tags.join(', ')}`);
  }
  console.log();

  // Generate code
  if (verbose) {
    console.log(chalk.dim('Generating code...'));
  }

  const files = generateCode(doc, config);

  // Write files
  const targetDir = resolve(configPath, '..', config.target);

  if (verbose) {
    console.log(chalk.dim(`Writing files to ${targetDir}`));
  }

  try {
    await writeGeneratedFiles(files, targetDir);
  } catch (error) {
    throw exitWithError(`Failed to write generated files: ${getErrorMessage(error)}`);
  }

  // Success message
  console.log(chalk.green(`Generated ${files.size} file(s) in ${config.target}`));
  for (const filename of files.keys()) {
    console.log(`  ${chalk.cyan(filename)}`);
  }
};
