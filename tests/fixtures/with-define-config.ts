import {defineConfig} from '../../src/index.js';

export default defineConfig({
  source: './spec.yaml',
  target: './gen',
  codegen: {
    dateType: 'Date',
    enumType: 'enum',
    propertyNameStyle: 'camelCase',
    nullableType: 'undefined',
  },
});
