export default {
  source: './api.json',
  target: './output',
  codegen: {
    dateType: 'string',
    enumType: 'constObject',
    propertyNameStyle: 'original',
    nullableType: 'null',
  },
};
