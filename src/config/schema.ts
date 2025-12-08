/**
 * Configuration for OpenCodegen.
 *
 * Create an `opencodegen.config.ts` file in your project root:
 * ```ts
 * import { defineConfig } from 'opencodegen';
 *
 * export default defineConfig({
 *   source: './openapi.yaml',
 *   target: './src/api',
 *   codegen: {
 *     dateType: 'string',
 *     enumType: 'union',
 *   },
 * });
 * ```
 */
export interface OpenCodegenConfig {
  /**
   * Path to the OpenAPI specification file.
   * Supports JSON and YAML formats.
   *
   * @example './openapi.yaml'
   * @example './specs/api.json'
   */
  source: string;

  /**
   * Directory where generated code will be written.
   * Will be created if it doesn't exist.
   *
   * @example './src/api'
   * @example './generated'
   */
  target: string;

  /**
   * Code generation options that affect the generated TypeScript output.
   */
  codegen: CodegenConfig;
}

export interface CodegenConfig {
  /**
   * How to represent date and date-time fields in generated types.
   *
   * - `'string'` - Dates are typed as `string` (safer, no parsing needed)
   * - `'Date'` - Dates are typed as `Date` (requires parsing from JSON)
   *
   * @default 'string'
   */
  dateType: 'string' | 'Date';

  /**
   * How to generate TypeScript types for OpenAPI enums.
   *
   * - `'union'` - String union type: `type Status = 'active' | 'inactive'`
   * - `'enum'` - TypeScript enum: `enum Status { Active = 'active' }`
   *
   * @default 'union'
   */
  enumType: 'union' | 'enum';
}

/**
 * Helper function to define configuration with type checking and autocomplete.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'opencodegen';
 *
 * export default defineConfig({
 *   source: './openapi.yaml',
 *   target: './src/api',
 *   codegen: {
 *     dateType: 'string',
 *     enumType: 'union',
 *   },
 * });
 * ```
 */
export const defineConfig = (config: OpenCodegenConfig): OpenCodegenConfig => {
  return config;
};
