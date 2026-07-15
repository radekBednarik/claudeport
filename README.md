# claudeport

Sync your [Claude Code](https://claude.com/claude-code) configuration — settings, skills, agents, commands, plugin selections, `CLAUDE.md`, keybindings — across machines, through a git repo **you** own. No server, no accounts.

```
workstation ~/.claude  ⇄  your git repo  ⇄  notebook ~/.claude
```

## Install

```sh
npm install -g claudeport
```

Requires Node ≥ 20 and `git` on your PATH.

## Quickstart

Create an **empty, private** repo (GitHub/GitLab/anywhere), then on your first machine:

```sh
claudeport init git@github.com:you/claude-config.git   # seeds the repo from ~/.claude
```

On every other machine:

```sh
claudeport init git@github.com:you/claude-config.git   # adopts the config from the repo
```

Day to day:

```sh
claudeport status   # what's out of sync
claudeport diff     # exact changes
claudeport push     # publish this machine's config
claudeport pull     # apply the repo's config here
```

## What syncs

The repo contains a `claudeport.json` manifest listing what to sync (relative to `~/.claude`). The default:

```json
{
  "version": 1,
  "paths": [
    "settings.json",
    "skills/",
    "agents/",
    "commands/",
    "CLAUDE.md",
    "keybindings.json",
    "plugins/installed_plugins.json",
    "plugins/known_marketplaces.json"
  ]
}
```

Edit it (and push) to change what syncs everywhere. Plugin *code* is never synced — only your selections travel. After a pull that changes plugins, restart Claude Code; if a plugin appears missing, reinstall it via `/plugin`.

## What never syncs

A hardcoded denylist wins over the manifest. Credentials (`.credentials.json`, anything matching `*credentials*`, `*.pem`, `*.key`), history, projects, sessions, caches, telemetry, and backups **cannot** be synced even if you add them to the manifest.

## Safety

- `pull` shows what will change and asks before touching anything (`--yes` to skip).
- Files it overwrites or deletes are backed up first to `~/.claude/backups/claudeport-<timestamp>/`.
- `push` refuses when the repo moved ahead — pull first, git style. No silent clobbering.
- Use a **private** repo: your settings may reveal hostnames, hook commands, and workflow details.

### Trust model

**Only sync a repo you fully control.** `pull` writes the repo's `settings.json`, `skills/`, `commands/`, and `agents/` into `~/.claude` — and those can contain hooks and instructions that run arbitrary commands. Pulling from a repo someone else can write to is equivalent to running their code on your machine. The confirm prompt lists which files change; run `claudeport diff` first if you want to see their contents.

## How it works

Your repo is cloned to `~/.claudeport`. `push` copies manifest-tracked files from `~/.claude` into the clone, commits, and pushes. `pull` fast-forwards the clone and copies files back. Plain files, plain git — you can inspect, revert, or recover anything with normal git commands in `~/.claudeport`.

## Configuration

By default claudeport reads `~/.claude` and clones into `~/.claudeport`. Override
either with the `config` command, which persists to a file in your native config dir
(`~/.config/claudeport/config.json` on Linux/macOS, `%APPDATA%\claudeport\config.json`
on Windows):

```sh
claudeport config set claude-dir ~/custom/.claude   # where your Claude config lives
claudeport config set sync-dir  ~/custom/.claudeport   # where the repo is cloned
claudeport config get           # list current values
claudeport config unset claude-dir
claudeport config path          # print the config file location
```

Each dir is resolved as **env var > config file > default**, so the env vars still
work as a per-shell / CI override:

| Setting | Env var | Config key | Default |
| --- | --- | --- | --- |
| Claude config dir | `CLAUDE_CONFIG_DIR` | `claude-dir` | `~/.claude` |
| Clone location | `CLAUDEPORT_DIR` | `sync-dir` | `~/.claudeport` |

## Not (yet) synced

MCP server configs (they often embed secrets and machine-specific paths), per-machine setting overrides, and project-level `.claude/` dirs are deliberately out of scope for v1.

## Development

Run the real `claudeport` command straight from a checkout, instead of `node dist/index.js`:

```sh
pnpm install
pnpm build          # compile src/ -> dist/ (the linked command runs the build output)
npm link            # symlink `claudeport` onto your PATH, pointing at this repo's dist/
```

Now `claudeport <cmd>` works from any directory and reflects your local code. While iterating, keep
a rebuild running in a second terminal so edits go live on save:

```sh
pnpm build:watch    # tsc --watch; recompiles into dist/ on every change
```

Run the tests with `pnpm test` (or `pnpm test:watch`). When you're done, remove the global link:

```sh
npm unlink -g claudeport
```

## License

MIT
