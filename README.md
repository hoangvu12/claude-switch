# claude-switch

Tired of logging in and out of Claude Code? Same.

This tool lets you save multiple Claude accounts as profiles and switch between them instantly. Works with subscriptions (Pro, Max, Team) and API keys.

## Install

```bash
npm install -g @hoangvu12/claude-switch
```

Or use it directly with `npx`:

```bash
npx @hoangvu12/claude-switch add personal
npx @hoangvu12/claude-switch use work
```

## Getting Started

```bash
# First add — offers to import your existing ~/.claude as a profile
claude-switch add personal

# Add another account (runs `claude /login` in an isolated profile dir)
claude-switch add work

# Switch instantly — takes effect in every terminal
claude-switch use personal
claude-switch use work

# No args = interactive picker
claude-switch
```

No shell setup, no sourcing, no env vars. Just run the command.

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

## How It Works

Each profile is a fully isolated Claude config directory at `~/.claude-switch/profiles/<name>/`. Switching profiles swings `~/.claude` as a **symlink** (directory junction on Windows, no admin needed) to point at the active profile. Claude Code, your IDE, and any wrappers like discord-rc just read `~/.claude` as usual — they don't even know it's a link.

Because we never copy credentials in or out, OAuth refresh tokens can't go stale. Claude Code refreshes tokens in place inside whatever profile dir is active; they stay valid across switches forever.

The small sync that still happens: `oauthAccount` (account identity, not tokens) lives in `~/.claude.json` which is a sibling of `~/.claude/`. The tool keeps a per-profile snapshot of this field and restores it on switch so the UI shows the right account.

**API key profiles** store the key in `settings.json` inside the profile dir, so it's automatically active when the junction points at that profile.

## Works With

- Windows (via directory junctions, no admin required)
- Linux (via symlinks)
- Any IDE that reads `~/.claude` — VS Code, Cursor, Windsurf, plain terminal
- Wrappers like discord-rc — they inherit `~/.claude` through the junction
- Subscriptions (Pro, Max, Team, Enterprise) and API keys

macOS is not supported in v3 — Claude Code stores OAuth tokens in Keychain on Mac (not in `~/.claude`), which the junction approach can't isolate.

## Upgrading from v2

v3 is a rewrite. Old profiles in `~/.claude-profiles/` are ignored — you'll re-add your accounts. This is deliberate: v2's copy-based approach could leave saved refresh tokens stale (and invalid). The new junction-based approach avoids that class of bug entirely. Safe to delete `~/.claude-profiles/` after setup.

## License

MIT
