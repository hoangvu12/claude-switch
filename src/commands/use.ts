import chalk from "chalk";
import { activate, profileExists, readActive, getProfileData } from "../lib/profiles";
import { profileCredentials } from "../lib/paths";
import { readJson } from "../lib/fs";
import { success, error, blank, formatLabel, formatType, maskKey } from "../lib/ui";
import type { CredentialsFile } from "../types";

export async function use(name: string): Promise<void> {
  blank();

  if (!(await profileExists(name))) {
    error(`Profile "${name}" not found.`);
    console.log(chalk.dim(`  Run ${chalk.cyan("claude-switch list")} to see your profiles`));
    blank();
    process.exit(1);
  }

  const current = await readActive();
  if (current === name) {
    success(`Already on ${chalk.bold(name)}`);
    blank();
    return;
  }

  try {
    await activate(name);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    blank();
    process.exit(1);
  }

  const data = await getProfileData(name);
  let label: string;
  if (data.type === "api-key" && data.apiKey) {
    label = chalk.dim(maskKey(data.apiKey));
  } else {
    const creds = await readJson<CredentialsFile | null>(profileCredentials(name), null);
    label = formatLabel(creds?.claudeAiOauth?.subscriptionType ?? null, "oauth");
  }

  success(`Switched to ${chalk.bold(name)}  ${formatType(data.type)}  ${label}`);
  blank();
}
