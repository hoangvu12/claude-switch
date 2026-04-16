import { spawn } from "child_process";
import chalk from "chalk";
import { select, password, confirm, input } from "@inquirer/prompts";
import {
  profileExists,
  createOAuthProfile,
  createApiKeyProfile,
  activate,
  inspectClaudeDir,
  importExistingClaude,
} from "../lib/profiles";
import { profileCredentials, profileAccountSnapshot } from "../lib/paths";
import { fileExists, writeJson } from "../lib/fs";
import { readOAuthAccount } from "../lib/claudeJson";
import { success, error, info, blank, maskKey, hint } from "../lib/ui";

async function maybeMigrateExistingClaude(): Promise<void> {
  if ((await inspectClaudeDir()) !== "real") return;

  blank();
  info("Detected an existing ~/.claude directory.");
  const doImport = await confirm({
    message: "Import it as a profile so we can safely manage it?",
    default: true,
  });
  if (!doImport) {
    error("Cannot proceed — ~/.claude must be empty, a junction, or imported first.");
    blank();
    process.exit(1);
  }

  let name = "default";
  while (await profileExists(name)) {
    name = await input({
      message: `Profile name for existing ~/.claude (taken: "${name}"):`,
      default: `${name}-1`,
    });
  }
  await importExistingClaude(name);
  success(`Imported existing ~/.claude as profile ${chalk.bold(name)}`);
  // Activate it so the junction gets created and everything stays working.
  await activate(name);
  blank();
}

export async function add(name: string): Promise<void> {
  blank();

  if (!name || /[/\\:*?"<>|.\s]/.test(name)) {
    error("Invalid profile name. Use letters, numbers, hyphens, or underscores.");
    blank();
    process.exit(1);
  }

  if (await profileExists(name)) {
    error(`Profile "${name}" already exists.`);
    blank();
    process.exit(1);
  }

  await maybeMigrateExistingClaude();

  const type = await select({
    message: "What type of profile?",
    choices: [
      { name: "OAuth — Use a Claude subscription (Pro, Max, Team, etc.)", value: "oauth" as const },
      { name: "API Key — Use an Anthropic API key", value: "api-key" as const },
    ],
  });

  if (type === "api-key") {
    await addApiKey(name);
  } else {
    await addOAuth(name);
  }
}

async function addApiKey(name: string): Promise<void> {
  const key = await password({
    message: "Paste your API key",
    mask: "*",
    validate: (v) => (v.trim() ? true : "API key cannot be empty"),
  });

  await createApiKeyProfile(name, key.trim());
  await activate(name);
  blank();
  success(`Profile ${chalk.bold(name)} created and active  ${chalk.dim(maskKey(key.trim()))}`);
  blank();
}

async function addOAuth(name: string): Promise<void> {
  await createOAuthProfile(name);
  // Point ~/.claude at the new (empty) profile so `claude /login` writes into it
  await activate(name);

  info("Launching Claude login...");
  blank();

  const proc = spawn("claude", ["/login"], {
    stdio: "inherit",
    shell: true,
  });
  await new Promise<void>((resolve) => proc.on("close", () => resolve()));

  const hasCreds = await fileExists(profileCredentials(name));
  if (!hasCreds) {
    blank();
    info("Couldn't find credentials in the new profile. Login may have been cancelled.");
  }

  // Snapshot the oauthAccount that Claude Code just wrote to ~/.claude.json
  const account = await readOAuthAccount();
  if (account) await writeJson(profileAccountSnapshot(name), account);

  blank();
  success(`Profile ${chalk.bold(name)} created and active`);
  blank();
}
