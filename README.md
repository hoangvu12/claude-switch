# claude-switch

Tired of logging in and out of Claude Code? Same.

Save multiple Claude accounts as profiles and switch between them instantly. Works with subscriptions (Pro, Max, Team, Enterprise) and API keys.

## Install

```bash
npm install -g @hoangvu12/claude-switch
```

## Getting Started

```bash
# First add — offers to import your existing ~/.claude as a profile
claude-switch add personal

# Add another account (runs `claude /login` in an isolated profile dir)
claude-switch add work

# Switch — takes effect in every terminal immediately
claude-switch use work

# No args = interactive picker
claude-switch
```

On your first `add`, claude-switch installs a small `claude` shim at `~/.claude-switch/bin/` and prints the one-line PATH edit you need to do. After that, `claude` in any terminal routes to the currently active profile automatically.

## Adding API Key Profiles

```bash
claude-switch add my-api
# Pick "API Key" when prompted, paste your key
```

## Commands

| Command | What it does |
|---|---|
| `claude-switch` | Opens an interactive picker |
| `claude-switch add <name>` | Save a new profile (OAuth or API key) |
| `claude-switch use <name>` | Switch to a profile |
| `claude-switch <name>` | Shorthand for `use` |
| `claude-switch list` | Show all your profiles |
| `claude-switch current` | Print the active profile |
| `claude-switch remove <name>` | Delete a profile |
| `claude-switch migrate` | Migrate from v3 (or re-run setup) |

## How It Works

Each profile lives at `~/.claude-switch/profiles/<name>/` — a self-contained Claude config dir. Switching writes the active profile's path to `~/.claude-switch/active-path`.

The installed shim at `~/.claude-switch/bin/claude` reads that pointer on every invocation, sets `CLAUDE_CONFIG_DIR`, and execs the real `claude` binary. So any terminal that has the shim on PATH picks up switches instantly — no shell sourcing, no daemon restarts.

**Why the env-var approach:** it's the officially supported knob, and it avoids the filesystem manipulation class of bugs (stale symlinks, merge conflicts losing skills, etc.).

## Works With

- Windows (PowerShell, CMD, Git Bash)
- Linux (bash, zsh, fish — any POSIX shell)
- Any tool that reads `CLAUDE_CONFIG_DIR` — `claude` itself, IDE extensions, editors
- [discord-rc](https://github.com/hoangvu12/discord-rc) v2+ — reads `~/.claude-switch/active-path` directly, so it live-follows the active profile with no restart needed

**macOS is supported for API-key profiles only.** Claude Code stores OAuth tokens in the Keychain on Mac, not inside `CLAUDE_CONFIG_DIR` — so OAuth profiles can't be isolated there. API-key profiles work fine everywhere.

## Upgrading from v3

v3 used directory junctions on `~/.claude`. v4 drops that entirely in favor of `CLAUDE_CONFIG_DIR` + a lightweight shim. Run:

```bash
claude-switch migrate
```

This unlinks the old junction, copies any shared content (skills, plugins, projects) back into each profile so they stay self-contained, and installs the shim. Your profile data is preserved. The v3 `~/.claude-switch/shared/` store becomes unused and can be deleted after you verify.

## Troubleshooting

**`claude` still launches without profile routing.**
Your shell can't find the shim. Check `which claude` (Linux/Mac) or `where claude` (Windows) — it should point at `~/.claude-switch/bin/claude`. If not, re-run the PATH export from `claude-switch migrate` output.

**Wrong profile is active.**
Run `claude-switch current` to verify. Then `claude-switch use <name>` to switch.

**Credentials disappeared after switch.**
You shouldn't see this on v4 — each profile's credentials live in its own dir and never get copied. If you do, open an issue.

## License

MIT
