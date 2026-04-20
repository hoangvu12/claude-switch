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
import {
  profileCredentials,
  profileAccountSnapshot,
  profileDir,
  BIN_DIR,
} from "../lib/paths";
import { fileExists, writeJson } from "../lib/fs";
import { readOAuthAccount } from "../lib/claudeJson";
import {
  installShim,
  shimInstalled,
  binDirOnPath,
  resolveRealClaude,
  pathInstructions,
} from "../lib/shim";
import { success, error, info, blank, maskKey, hint } from "../lib/ui";

async function ensureSetup(): Promise<void> {
  if (!(await shimInstalled())) {
    await installShim();
  }
  const real = await resolveRealClaude();
  if (!real) {
    error(
      "Could not find the `claude` binary on your PATH. " +
        "Install Claude Code first (https://docs.anthropic.com/en/docs/claude-code).",
    );
    blank();
    process.exit(1);
  }
  if (!binDirOnPath()) {
    blank();
    info(chalk.bold("One-time setup — add claude-switch's shim dir to PATH:"));
    console.log();
    for (const line of pathInstructions().split("\n")) {
      console.log(`  ${line}`);
    }
    blank();
    hint(
      `Without this, typing ${chalk.cyan("claude")} still runs the original binary ` +
        `without profile routing. claude-switch itself works either way.`,
    );
    blank();
  }
}

async function maybeImportExistingClaude(): Promise<void> {
  if ((await inspectClaudeDir()) !== "real") return;

  blank();
  info("Detected an existing ~/.claude directory.");
  const doImport = await confirm({
    message: "Import it as a profile? (recommended — otherwise it stays untouched)",
    default: true,
  });
  if (!doImport) return;

  let name = "default";
  while (await profileExists(name)) {
    name = await input({
      message: `Profile name (taken: "${name}"):`,
      default: `${name}-1`,
    });
  }
  await importExistingClaude(name);
  await activate(name);
  success(`Imported existing ~/.claude as profile ${chalk.bold(name)} and made it active`);
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

  await ensureSetup();
  await maybeImportExistingClaude();

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
  await activate(name);

  const real = await resolveRealClaude();
  if (!real) {
    error("Couldn't locate the real `claude` binary to run /login.");
    blank();
    process.exit(1);
  }

  info("Launching Claude login...");
  blank();

  const proc = spawn(real, ["/login"], {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, CLAUDE_CONFIG_DIR: profileDir(name) },
  });
  await new Promise<void>((resolve) => proc.on("close", () => resolve()));

  const hasCreds = await fileExists(profileCredentials(name));
  if (!hasCreds) {
    blank();
    info("Couldn't find credentials in the new profile. Login may have been cancelled.");
  }

  const account = await readOAuthAccount();
  if (account) await writeJson(profileAccountSnapshot(name), account);

  blank();
  success(`Profile ${chalk.bold(name)} created and active`);
  if (!binDirOnPath()) {
    hint(`Remember to add ${BIN_DIR} to PATH for automatic profile routing.`);
  }
  blank();
}
