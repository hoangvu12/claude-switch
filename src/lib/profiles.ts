import { readdir, readFile, writeFile, rm } from "fs/promises";
import {
  PROFILES_DIR,
  ROOT_DIR,
  ACTIVE_FILE,
  ACTIVE_PATH_FILE,
  CLAUDE_DIR,
  profileDir,
  profileCredentials,
  profileSettings,
  profileMeta,
  profileAccountSnapshot,
} from "./paths";
import {
  fileExists,
  readJson,
  writeJson,
  ensureDir,
  renameDir,
  classifyPath,
} from "./fs";
import { readOAuthAccount, writeOAuthAccount } from "./claudeJson";
import { maskKey } from "./ui";
import type { ProfileData, ProfileInfo, CredentialsFile } from "../types";

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
    await writeFile(ACTIVE_PATH_FILE, profileDir(name));
  } else {
    for (const f of [ACTIVE_FILE, ACTIVE_PATH_FILE]) {
      try { await rm(f); } catch {}
    }
  }
}

// -- profile metadata --

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

// -- ~/.claude inspection / import --

export type ClaudeDirState = "missing" | "link" | "real";

export async function inspectClaudeDir(): Promise<ClaudeDirState> {
  const kind = await classifyPath(CLAUDE_DIR);
  if (kind === "none") return "missing";
  if (kind === "link") return "link";
  return "real";
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

  const account = await readOAuthAccount();
  if (account) await writeJson(profileAccountSnapshot(name), account);
}

// -- create / activate / remove --

export async function createOAuthProfile(name: string): Promise<void> {
  await ensureDir(profileDir(name));
  await writeProfileMeta(name, { type: "oauth" });
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
}

/**
 * Save the currently-active profile's live oauthAccount back into its
 * snapshot so the account-identity UI stays correct across switches.
 * Credentials themselves don't need copying — each profile dir is
 * CLAUDE_CONFIG_DIR while active, so refreshed tokens land directly inside.
 */
async function snapshotActive(): Promise<void> {
  const active = await readActive();
  if (!active || !(await profileExists(active))) return;
  const account = await readOAuthAccount();
  if (account) {
    await writeJson(profileAccountSnapshot(active), account);
  }
}

export async function activate(name: string): Promise<void> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  await snapshotActive();

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
    await writeOAuthAccount(null);
    await writeActive(null);
  }
  await rm(profileDir(name), { recursive: true, force: true });
}
