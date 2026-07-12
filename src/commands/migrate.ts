import { readdir, readlink, rm, cp, unlink, copyFile, stat } from "fs/promises";
import { join } from "path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import {
  CLAUDE_DIR,
  PROFILES_DIR,
  ACTIVE_PATH_FILE,
  REAL_CLAUDE_FILE,
  profileDir,
  profileCredentials,
} from "../lib/paths";
import { classifyPath, fileExists, ensureDir } from "../lib/fs";
import {
  inspectClaudeDir,
  readActive,
  profileExists,
  activate,
} from "../lib/profiles";
import {
  installShim,
  shimInstalled,
  binDirOnPath,
  pathInstructions,
  resolveRealClaude,
} from "../lib/shim";
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
const STRAY_CREDS = join(CLAUDE_DIR, ".credentials.json");

interface MigrationState {
  claudeIsJunction: boolean;
  profilesWithInnerLinks: string[];
  sharedDirExists: boolean;
  activePathMissing: boolean;
  realClaudeMissing: boolean;
  shimMissing: boolean;
  strayCredsDest: string | null;
  active: string | null;
}

async function detectState(): Promise<MigrationState> {
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

  const active = await readActive();
  const activeValid = !!active && (await profileExists(active));

  const activePathMissing = activeValid && !(await fileExists(ACTIVE_PATH_FILE));
  const realClaudeMissing = !(await fileExists(REAL_CLAUDE_FILE));
  const shimMissing = !(await shimInstalled());

  // Stray creds: ~/.claude is a real dir (post-junction-removal) with creds
  // that are newer than the active profile's creds. Happens when claude runs
  // without the shim (PATH not set up), so fresh login tokens land in the
  // default dir instead of the profile.
  let strayCredsDest: string | null = null;
  if (
    activeValid &&
    (await inspectClaudeDir()) === "real" &&
    (await fileExists(STRAY_CREDS))
  ) {
    const dest = profileCredentials(active!);
    const destExists = await fileExists(dest);
    let shouldMove = !destExists;
    if (destExists) {
      try {
        const srcStat = await stat(STRAY_CREDS);
        const destStat = await stat(dest);
        shouldMove = srcStat.mtimeMs > destStat.mtimeMs;
      } catch {}
    }
    if (shouldMove) strayCredsDest = dest;
  }

  return {
    claudeIsJunction,
    profilesWithInnerLinks,
    sharedDirExists: await fileExists(SHARED_DIR),
    activePathMissing,
    realClaudeMissing,
    shimMissing,
    strayCredsDest,
    active,
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
  const state = await detectState();

  const needsMigration =
    state.claudeIsJunction ||
    state.profilesWithInnerLinks.length > 0 ||
    state.sharedDirExists ||
    state.activePathMissing ||
    state.realClaudeMissing ||
    state.shimMissing ||
    state.strayCredsDest !== null;

  if (!needsMigration) {
    info("Nothing to migrate — you're already on v4.");
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
  if (state.strayCredsDest && state.active) {
    console.log(
      `  • Move fresh credentials from ${chalk.cyan(STRAY_CREDS)} into profile ${chalk.bold(state.active)} ` +
        chalk.dim("(login happened without shim routing)"),
    );
  }
  if (state.activePathMissing && state.active) {
    console.log(
      `  • Write ${chalk.cyan(ACTIVE_PATH_FILE)} so the shim can set CLAUDE_CONFIG_DIR`,
    );
  }
  if (state.shimMissing) {
    console.log(`  • Install claude shim at ~/.claude-switch/bin/`);
  }
  if (state.realClaudeMissing) {
    console.log(`  • Detect and cache the real \`claude\` binary path`);
  }
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

  // 3. Move stray credentials into the active profile
  if (state.strayCredsDest && state.active) {
    try {
      await copyFile(STRAY_CREDS, state.strayCredsDest);
      await rm(STRAY_CREDS, { force: true });
      success(
        `Moved fresh credentials into profile ${chalk.bold(state.active)}.`,
      );
    } catch (err) {
      error(
        `Failed to move stray credentials: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // 4. Write active-path (via re-activating the current profile)
  if (state.activePathMissing && state.active) {
    try {
      await activate(state.active);
      success(
        `Wrote active-path → ${chalk.bold(state.active)}.`,
      );
    } catch (err) {
      error(
        `Failed to write active-path: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // 5. Install shim
  if (state.shimMissing) {
    await installShim();
    success("Installed claude shim at ~/.claude-switch/bin/");
  }

  // 6. Cache the real claude binary path
  if (state.realClaudeMissing) {
    const real = await resolveRealClaude();
    if (real) {
      success(`Found real \`claude\` at ${chalk.cyan(real)}.`);
    } else {
      error(
        `Could not find the \`claude\` binary on PATH. The shim will fail until ` +
          `you install Claude Code and re-run \`claude-switch migrate\`.`,
      );
    }
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
