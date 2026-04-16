import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { removeProfile, profileExists, readActive } from "../lib/profiles";
import { success, error, blank } from "../lib/ui";

export async function remove(name: string): Promise<void> {
  blank();

  if (!(await profileExists(name))) {
    error(`Profile "${name}" does not exist.`);
    blank();
    process.exit(1);
  }

  const active = await readActive();
  const isActive = active === name;

  const ok = await confirm({
    message: `Delete profile "${name}"?${isActive ? chalk.yellow(" (currently active)") : ""}`,
    default: false,
  });

  if (!ok) {
    console.log(chalk.dim("  Cancelled"));
    blank();
    return;
  }

  await removeProfile(name);
  blank();
  success(`Profile ${chalk.bold(name)} removed`);
  blank();
}
