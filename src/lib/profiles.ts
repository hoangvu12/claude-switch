import { mkdir, readdir, rename, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  PROFILES_DIR,
  ACTIVE_FILE,
  ROOT_DIR,
  CLAUDE_DIR,
  SHARED_SUBDIRS,
  sharedSubdir,
  profileDir,
  profileSubdir,
  profileCredentials,
  profileSettings,
  profileMeta,
  profileAccountSnapshot,
} from "./paths";
import {
  fileExists,
  readJson,
  writeJson,
  classifyPath,
  linkDir,
  unlinkLink,
  renameDir,
} from "./fs";
import { readOAuthAccount, writeOAuthAccount } from "./claudeJson";
import { maskKey } from "./ui";
import type { ProfileData, ProfileInfo, CredentialsFile } from "../types";

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// -- shared user-level content (history, skills, plugins, ...) --

/**
 * Recursively move every child of `src` into `dest`.
 * On file conflicts, keep the existing (shared) version. On directory
 * conflicts, recurse in. Removes `src` afterward.
 */
async function mergeDirInto(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const sp = join(src, entry.name);
    const dp = join(dest, entry.name);
    const destKind = await classifyPath(dp);
    if (destKind === "none") {
      await rename(sp, dp);
    } else if (entry.isDirectory() && destKind === "dir") {
      await mergeDirInto(sp, dp);
    }
  }
  await rm(src, { recursive: true, force: true });
}

/**
 * Ensure each SHARED_SUBDIRS entry inside the profile is a junction into
 * the central shared dir. On first switch, a profile's existing contents
 * (e.g. old `projects/`, `skills/`) are merged into the shared store.
 */
async function ensureSharedLinks(profile: string): Promise<void> {
  for (const sub of SHARED_SUBDIRS) {
    const shared = sharedSubdir(sub);
    await ensureDir(shared);
    const link = profileSubdir(profile, sub);
    const kind = await classifyPath(link);
    if (kind === "link") continue;
    if (kind === "dir") {
      await mergeDirInto(link, shared);
    } else if (kind === "file") {
      throw new Error(`Unexpected file at ${link}; delete it and retry.`);
    }
    await linkDir(shared, link);
  }
}

// -- active profile state --

export async function readActive(): Promise<string | null> {
  try {
    const content = (await readFile(ACTIVE_FILE, "utf-8")).trim();
    return content || null;
  } catch {
    return null;
  }
}

async function writeActive(name: string | null): Promise<void> {
  await ensureDir(ROOT_DIR);
  if (name) {
    await writeFile(ACTIVE_FILE, name);
  } else {
    try {
      await rm(ACTIVE_FILE);
    } catch {}
  }
}

// -- profile metadata (type, api key) --

async function readProfileMeta(name: string): Promise<ProfileData> {
  return readJson<ProfileData>(profileMeta(name), { type: "oauth" });
}

async function writeProfileMeta(name: string, data: ProfileData): Promise<void> {
  await writeJson(profileMeta(name), data);
}

// -- listing --

export async function listProfiles(): Promise<ProfileInfo[]> {
  await ensureDir(PROFILES_DIR);
  const active = await readActive();
  const entries = await readdir(PROFILES_DIR, { withFileTypes: true });
  const profiles: ProfileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!(await fileExists(profileMeta(entry.name)))) continue;

    const data = await readProfileMeta(entry.name);
    let label: string | null = null;

    if (data.type === "api-key" && data.apiKey) {
      label = maskKey(data.apiKey);
    } else {
      const creds = await readJson<CredentialsFile | null>(
        profileCredentials(entry.name),
        null,
      );
      label = creds?.claudeAiOauth?.subscriptionType ?? null;
    }

    profiles.push({
      name: entry.name,
      type: data.type,
      label,
      isActive: active === entry.name,
    });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function profileExists(name: string): Promise<boolean> {
  return fileExists(profileMeta(name));
}

export async function getProfileData(name: string): Promise<ProfileData> {
  return readProfileMeta(name);
}

// -- junction management --

/**
 * Result of inspecting ~/.claude.
 * - "missing": doesn't exist
 * - "junction": already our junction (or any symlink)
 * - "real": a real directory with Claude's files — needs migration before linking
 */
export type ClaudeDirState = "missing" | "junction" | "real";

export async function inspectClaudeDir(): Promise<ClaudeDirState> {
  const kind = await classifyPath(CLAUDE_DIR);
  if (kind === "none") return "missing";
  if (kind === "link") return "junction";
  return "real";
}

async function pointClaudeAt(target: string): Promise<void> {
  const kind = await classifyPath(CLAUDE_DIR);
  if (kind === "link") {
    await unlinkLink(CLAUDE_DIR);
  } else if (kind === "dir") {
    throw new Error(
      `~/.claude is a real directory. Import or move it first.`,
    );
  } else if (kind === "file") {
    throw new Error(`~/.claude exists as a file — unexpected. Please inspect manually.`);
  }
  await linkDir(target, CLAUDE_DIR);
}

/** Move an existing real ~/.claude into a new profile under the given name. */
export async function importExistingClaude(name: string): Promise<void> {
  if ((await inspectClaudeDir()) !== "real") {
    throw new Error("~/.claude is not a real directory; nothing to import.");
  }
  if (await profileExists(name)) {
    throw new Error(`Profile "${name}" already exists.`);
  }
  await ensureDir(PROFILES_DIR);
  await renameDir(CLAUDE_DIR, profileDir(name));
  await writeProfileMeta(name, { type: "oauth" });
  await ensureSharedLinks(name);

  // Snapshot the current oauthAccount from ~/.claude.json
  const account = await readOAuthAccount();
  if (account) await writeJson(profileAccountSnapshot(name), account);
}

// -- create / activate / remove --

export async function createOAuthProfile(name: string): Promise<void> {
  await ensureDir(profileDir(name));
  await writeProfileMeta(name, { type: "oauth" });
  await ensureSharedLinks(name);
}

export async function createApiKeyProfile(
  name: string,
  apiKey: string,
): Promise<void> {
  await ensureDir(profileDir(name));
  await writeProfileMeta(name, { type: "api-key", apiKey });
  await writeJson(profileSettings(name), {
    env: { ANTHROPIC_API_KEY: apiKey },
  });
  await ensureSharedLinks(name);
}

/**
 * Save the currently-active profile's ephemeral state (oauthAccount) back
 * into its snapshot, so any changes Claude Code made while it was active
 * are preserved across switches.
 */
async function snapshotActive(): Promise<void> {
  const active = await readActive();
  if (!active) return;
  if (!(await profileExists(active))) return;
  const account = await readOAuthAccount();
  if (account) {
    await writeJson(profileAccountSnapshot(active), account);
  }
}

export async function activate(name: string): Promise<void> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  // Preserve current profile's identity before switching away
  await snapshotActive();

  // Migrate both profiles' local user-level dirs (history, skills, etc.)
  // into the shared store on first switch, so they survive across profiles.
  const active = await readActive();
  if (active && active !== name && (await profileExists(active))) {
    await ensureSharedLinks(active);
  }
  await ensureSharedLinks(name);

  // Swing the junction
  await pointClaudeAt(profileDir(name));

  // Restore this profile's oauthAccount into ~/.claude.json
  const saved = await readJson<Record<string, unknown> | null>(
    profileAccountSnapshot(name),
    null,
  );
  await writeOAuthAccount(saved);

  await writeActive(name);
}

export async function removeProfile(name: string): Promise<void> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }
  const active = await readActive();
  if (active === name) {
    // Unhook ~/.claude first so we don't try to delete through the junction
    const kind = await classifyPath(CLAUDE_DIR);
    if (kind === "link") await unlinkLink(CLAUDE_DIR);
    await writeOAuthAccount(null);
    await writeActive(null);
  }
  // Detach junctions into shared content so rm doesn't touch the shared store.
  for (const sub of SHARED_SUBDIRS) {
    const link = profileSubdir(name, sub);
    if ((await classifyPath(link)) === "link") {
      await unlinkLink(link);
    }
  }
  await rm(profileDir(name), { recursive: true, force: true });
}
