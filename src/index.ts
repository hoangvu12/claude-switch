#!/usr/bin/env node

import chalk from "chalk";
import { select } from "@inquirer/prompts";
import { listProfiles, readActive, inspectClaudeDir } from "./lib/profiles";
import { formatLabel, formatType, blank, hint, info } from "./lib/ui";
import { add } from "./commands/add";
import { use } from "./commands/use";
import { list } from "./commands/list";
import { remove } from "./commands/remove";
import { current } from "./commands/current";
import { migrate } from "./commands/migrate";

const HELP = `
  ${chalk.bold("claude-switch")} — Switch between Claude Code accounts

  ${chalk.dim("Usage:")}
    claude-switch                  Interactive profile picker
    claude-switch add <name>       Add a new profile
    claude-switch use <name>       Switch to a profile
    claude-switch list             List all profiles
    claude-switch remove <name>    Remove a profile
    claude-switch current          Show active profile
    claude-switch migrate          Migrate from v3 (or re-run setup)
    claude-switch help             Show this help

  ${chalk.dim("Shortcuts:")}
    claude-switch <name>           Same as 'use <name>'
    claude-switch ls               Same as 'list'
    claude-switch rm <name>        Same as 'remove <name>'
`;

/**
 * If we detect v3-era state (~/.claude is a junction we own), print a hint.
 * Don't block — users running one-off commands shouldn't be forced through migration.
 */
async function maybeNagAboutMigration(): Promise<void> {
  if ((await inspectClaudeDir()) === "link") {
    blank();
    info(
      chalk.yellow("v3 state detected") +
        chalk.dim(` — run `) +
        chalk.cyan("claude-switch migrate") +
        chalk.dim(" to move to v4 (env-var based)."),
    );
  }
}

async function interactivePicker(): Promise<void> {
  const profiles = await listProfiles();

  if (profiles.length === 0) {
    blank();
    console.log(chalk.bold("  Welcome to claude-switch"));
    blank();
    hint(`Run ${chalk.cyan("claude-switch add <name>")} to save your first profile`);
    blank();
    return;
  }

  blank();
  const active = await readActive();

  const choice = await select({
    message: "Switch to profile",
    choices: profiles.map((p) => ({
      name: [
        p.name,
        formatType(p.type),
        formatLabel(p.label, p.type),
        p.isActive ? chalk.dim("(active)") : "",
      ]
        .filter(Boolean)
        .join("  "),
      value: p.name,
    })),
    default: active ?? undefined,
  });

  await use(choice);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case "add":
        if (!args[0]) {
          console.error(chalk.red("\n  Usage: claude-switch add <name>\n"));
          process.exit(1);
        }
        await add(args[0]);
        break;

      case "use":
        if (!args[0]) {
          console.error(chalk.red("\n  Usage: claude-switch use <name>\n"));
          process.exit(1);
        }
        await use(args[0]);
        break;

      case "list":
      case "ls":
        await list();
        await maybeNagAboutMigration();
        break;

      case "remove":
      case "rm":
        if (!args[0]) {
          console.error(chalk.red("\n  Usage: claude-switch remove <name>\n"));
          process.exit(1);
        }
        await remove(args[0]);
        break;

      case "current":
        await current();
        await maybeNagAboutMigration();
        break;

      case "migrate":
        await migrate();
        break;

      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        break;

      case undefined:
        await interactivePicker();
        await maybeNagAboutMigration();
        break;

      default: {
        const profiles = await listProfiles();
        const match = profiles.find((p) => p.name === command);
        if (match) {
          await use(command);
        } else {
          console.error(chalk.red(`\n  Unknown command: "${command}"`));
          console.log(HELP);
          process.exit(1);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("User force closed")) {
      blank();
      process.exit(0);
    }
    throw err;
  }
}

main();
