import type {OpenCodegenConfig} from '../../src/config/schema.js';

const config: OpenCodegenConfig = {
  source: './api.yaml',
  target: './generated',
  codegen: {
    dateType: 'string',
    enumType: 'union',
    propertyNameStyle: 'original',
    nullableType: 'null',
  },
};

export default config;
