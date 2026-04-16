import { CLAUDE_JSON } from "./paths";
import { fileExists, readJson, writeJson } from "./fs";

type ClaudeJson = Record<string, unknown> & { oauthAccount?: Record<string, unknown> };

export async function readOAuthAccount(): Promise<Record<string, unknown> | null> {
  if (!(await fileExists(CLAUDE_JSON))) return null;
  const data = await readJson<ClaudeJson>(CLAUDE_JSON, {});
  return data.oauthAccount ?? null;
}

export async function writeOAuthAccount(
  account: Record<string, unknown> | null,
): Promise<void> {
  const data = await readJson<ClaudeJson>(CLAUDE_JSON, {});
  if (account) {
    data.oauthAccount = account;
  } else {
    delete data.oauthAccount;
  }
  await writeJson(CLAUDE_JSON, data);
}
