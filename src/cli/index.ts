#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {generate} from './commands/generate.js';
import {printHelp} from './commands/help.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as {version: string};

const main = async (): Promise<void> => {
  const {values} = parseArgs({
    options: {
      help: {type: 'boolean', short: 'h'},
      version: {type: 'boolean', short: 'v'},
      config: {type: 'string', short: 'c'},
      verbose: {type: 'boolean'},
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(packageJson.version);
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  await generate({config: values.config, verbose: values.verbose});
};

main();
