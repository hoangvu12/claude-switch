import chalk from "chalk";
import { readActive, getProfileData } from "../lib/profiles";
import { profileDir } from "../lib/paths";
import { blank, hint, formatType } from "../lib/ui";

export async function current(): Promise<void> {
  const active = await readActive();

  blank();
  if (active) {
    const data = await getProfileData(active);
    console.log(`  ${chalk.green.bold(active)}  ${formatType(data.type)}`);
    console.log(chalk.dim(`  ${profileDir(active)}`));
  } else {
    console.log(`  ${chalk.dim("No active profile")}`);
    hint(`Run ${chalk.cyan("claude-switch add <name>")} to create one`);
  }
  blank();
}
