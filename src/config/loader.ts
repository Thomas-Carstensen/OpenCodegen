import {register} from 'tsx/esm/api';
import {pathToFileURL} from 'node:url';
import type {OpenCodegenConfig} from './schema.js';

/**
 * Load a TypeScript/JavaScript config file.
 *
 * @param configPath - Absolute path to the config file
 * @returns The loaded configuration object
 */
export const loadConfig = async (configPath: string): Promise<OpenCodegenConfig> => {
  // Register tsx to handle TypeScript imports
  const unregister = register();

  try {
    // Convert path to file URL for dynamic import
    const configUrl = pathToFileURL(configPath).href;

    // Import the config file
    const configModule = await import(configUrl);

    // Get the default export
    const config = configModule.default as OpenCodegenConfig;

    if (!config) {
      throw new Error('Config file must have a default export');
    }

    return config;
  } finally {
    // Clean up tsx registration
    unregister();
  }
};
