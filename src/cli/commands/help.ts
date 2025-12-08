import chalk from "chalk";

export const printHelp = (): void => {
  console.log(`
${chalk.green("opencodegen")} - Generate typed API clients from OpenAPI specifications

${chalk.yellow("Usage:")}
  opencodegen [options]

${chalk.yellow("Options:")}
  -c, --config <path>  Path to config file (default: opencodegen.config.ts)
  -h, --help           Show this help message
  -v, --version        Show version number

${chalk.yellow("Examples:")}
  opencodegen                        # Use default config file
  opencodegen --config my.config.ts  # Use custom config file
`);
};
