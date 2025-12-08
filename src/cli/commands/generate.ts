import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";

export interface GenerateOptions {
  config?: string;
}

export const generate = (options: GenerateOptions): void => {
  const configPath = resolve(options.config ?? "opencodegen.config.ts");

  if (!existsSync(configPath)) {
    console.error(chalk.red(`Error: Config file not found: ${configPath}`));
    console.error(
      chalk.dim("Create an opencodegen.config.ts file or specify one with --config")
    );
    process.exit(1);
  }

  console.log(chalk.green("OpenCodegen"));
  console.log();
  console.log(`Config: ${chalk.cyan(configPath)}`);
  console.log();
  console.log(chalk.yellow("Config loading not yet implemented - coming next"));
};
