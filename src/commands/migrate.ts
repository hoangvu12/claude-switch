import { readdir, readlink, rm, cp, unlink } from "fs/promises";
import { join } from "path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import {
  CLAUDE_DIR,
  PROFILES_DIR,
  profileDir,
} from "../lib/paths";
import { classifyPath, fileExists, ensureDir } from "../lib/fs";
import { inspectClaudeDir } from "../lib/profiles";
import { installShim, shimInstalled, binDirOnPath, pathInstructions } from "../lib/shim";
import { success, error, info, blank, hint } from "../lib/ui";

// v3.1.0 subdirs that were junctioned into ~/.claude-switch/shared/
const V3_SHARED_SUBDIRS = [
  "projects",
  "todos",
  "plans",
  "skills",
  "plugins",
  "agents",
  "commands",
];

const SHARED_DIR = join(PROFILES_DIR, "..", "shared");

async function detectV3State(): Promise<{
  claudeIsJunction: boolean;
  profilesWithInnerLinks: string[];
  sharedDirExists: boolean;
}> {
  const claudeIsJunction = (await inspectClaudeDir()) === "link";

  const profilesWithInnerLinks: string[] = [];
  if (await fileExists(PROFILES_DIR)) {
    const entries = await readdir(PROFILES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      for (const sub of V3_SHARED_SUBDIRS) {
        const p = join(profileDir(entry.name), sub);
        if ((await classifyPath(p)) === "link") {
          profilesWithInnerLinks.push(entry.name);
          break;
        }
      }
    }
  }

  return {
    claudeIsJunction,
    profilesWithInnerLinks,
    sharedDirExists: await fileExists(SHARED_DIR),
  };
}

/**
 * Replace a junction `<profile>/<sub>` with a real copy of the shared dir's
 * contents, so the profile becomes self-contained.
 */
async function materializeInnerLink(profile: string, sub: string): Promise<void> {
  const link = join(profileDir(profile), sub);
  if ((await classifyPath(link)) !== "link") return;

  let target: string;
  try {
    target = await readlink(link);
  } catch {
    return;
  }

  await unlink(link).catch(async () => {
    await rm(link, { recursive: false, force: true }).catch(() => {});
  });

  if (await fileExists(target)) {
    await cp(target, link, { recursive: true, force: false, errorOnExist: false });
  } else {
    await ensureDir(link);
  }
}

export async function migrate(): Promise<void> {
  blank();
  const state = await detectV3State();

  const needsMigration =
    state.claudeIsJunction ||
    state.profilesWithInnerLinks.length > 0 ||
    state.sharedDirExists;

  if (!needsMigration) {
    info("Nothing to migrate — you're already on v4.");
    if (!(await shimInstalled())) {
      await installShim();
      success("Installed claude shim.");
    }
    if (!binDirOnPath()) {
      blank();
      info("Add the shim dir to PATH:");
      for (const line of pathInstructions().split("\n")) {
        console.log(`  ${line}`);
      }
    }
    blank();
    return;
  }

  info(chalk.bold("v4 migration plan:"));
  if (state.claudeIsJunction) {
    console.log(`  • Remove junction at ${chalk.cyan(CLAUDE_DIR)} (env var replaces it)`);
  }
  if (state.profilesWithInnerLinks.length > 0) {
    console.log(
      `  • Copy shared content (skills/plugins/projects/…) into each profile: ` +
        state.profilesWithInnerLinks.map((n) => chalk.cyan(n)).join(", "),
    );
  }
  if (state.sharedDirExists) {
    console.log(`  • Keep ${chalk.cyan(SHARED_DIR)} for now (you can delete it after)`);
  }
  console.log(`  • Install claude shim at ~/.claude-switch/bin/`);
  blank();

  const ok = await confirm({ message: "Proceed?", default: true });
  if (!ok) {
    hint("Cancelled. Nothing changed.");
    blank();
    return;
  }

  // 1. Materialize inner links per profile
  for (const profile of state.profilesWithInnerLinks) {
    for (const sub of V3_SHARED_SUBDIRS) {
      try {
        await materializeInnerLink(profile, sub);
      } catch (err) {
        error(
          `Failed to materialize ${profile}/${sub}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
    success(`Profile ${chalk.bold(profile)} is now self-contained.`);
  }

  // 2. Unlink ~/.claude junction
  if (state.claudeIsJunction) {
    try {
      await unlink(CLAUDE_DIR);
    } catch {
      await rm(CLAUDE_DIR, { recursive: false, force: true }).catch(() => {});
    }
    success(`Removed ~/.claude junction. CLAUDE_CONFIG_DIR routes via the shim now.`);
  }

  // 3. Install shim
  if (!(await shimInstalled())) {
    await installShim();
    success("Installed claude shim at ~/.claude-switch/bin/");
  }

  blank();
  if (!binDirOnPath()) {
    info(chalk.bold("Last step — add the shim dir to PATH:"));
    blank();
    for (const line of pathInstructions().split("\n")) {
      console.log(`  ${line}`);
    }
    blank();
  }

  if (state.sharedDirExists) {
    hint(
      `Shared store at ${SHARED_DIR} is no longer used. Safe to delete once you've ` +
        `verified your profiles still have their skills/plugins.`,
    );
    blank();
  }

  success("Migration complete.");
  blank();
}
