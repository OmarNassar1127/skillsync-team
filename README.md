# SkillSync

**Git-native skill sharing for Claude Code teams.**

You and your team use [Claudeception](https://github.com/OmarNassar1127/Claudeception) to extract reusable skills from work sessions. But those skills are siloed on individual machines. SkillSync bridges the gap — a shared Git repo as the single source of truth, a CLI to push and pull, and an auto-sync hook so everyone stays current.

## What's new in 3.0

- **`skillsync archive [skill]`** — clean up your skill set without losing anything. Archive removes a skill from the shared repo + registry **and** moves your local copy out of `~/.claude/skills/` into `~/.skillsync/archive/`. Claude Code stops loading it; the files are preserved with metadata (when, who, why) for later restoration.
- **`skillsync unarchive [skill]`** — restore an archived skill back to active use. Picker shows what's in your archive, with the date and reason from when you archived.
- **`skillsync archived`** — list everything currently in your archive with metadata.
- **Tab completion** — `skillsync push <TAB>` completes to your local skill names; `skillsync unarchive <TAB>` to your archived ones; etc. One-line install via `skillsync completion <bash|zsh|fish>`.
- **Picker order**: skills now sort by **filesystem timestamp** (birth time, falling back to most-recent file mtime), newest first. The skills you just edited float to the top — no more hunting alphabetically.
- **Default unchecked** in pickers — push and pull no longer pre-select anything. You actively pick what to act on. Safer.
- **"Archived" section** in `skillsync list` so your archive stays discoverable.

### Tab completion install

```bash
# zsh (default on modern macOS)
echo 'eval "$(skillsync completion zsh)"' >> ~/.zshrc && source ~/.zshrc

# bash
echo 'eval "$(skillsync completion bash)"' >> ~/.bashrc && source ~/.bashrc

# fish
skillsync completion fish > ~/.config/fish/completions/skillsync.fish
```

After install, every command that takes a skill name is tab-completable — `push`, `archive`, `unarchive`, `remove`, `diff`, plus `pull -s`. Skill names come from your live filesystem and registry, so they update automatically as you push, pull, archive.

Upgrade existing installs: `skillsync update` (or `npm install -g skillsync-team@latest`)

## What was new in 2.x

**2.2**
- **`skillsync diff <skill>`** — see exactly what would change before you push or pull. Side-by-side diff between your local skill and the shared repo. Pass `--pull` to flip direction.
- **Validation on push** — SkillSync now refuses to push a skill with malformed YAML, an empty description, or no SKILL.md at all. Warnings for soft issues (name doesn't match dir, invalid semver). One teammate's broken push can't break everyone's pull.
- **Outdated-version nudge** — when a newer SkillSync is on npm, every command shows a one-line banner: *"v2.2.0 → v2.3.0 available. Run skillsync update to install."* Cached for 24h so it's not noisy.

**2.1**
- **`skillsync update`** — self-update command. Checks npm for the latest version and runs the install for you. Use `--check` to just check without installing.

**2.0**
- **Interactive picker for `skillsync push`** — run with no arguments and get a checkbox list of only your **pushable** skills (new and locally-changed; skills already in sync are hidden). Local changes are pre-selected. Space toggles, enter pushes them all in a single batched commit. No more remembering exact skill names.
- **Interactive picker for `skillsync pull`** — same UX in reverse. New and updated skills from teammates show up as a checklist; pick which ones you want.
- **Auto version bump** — push a skill whose content changed but whose `version:` didn't? SkillSync bumps it for you (default: patch) and refreshes the `date:` field. No more "forgot to bump" registries full of `v0.0.0`.
- **`--all` flag** on push and pull for non-interactive use.
- **`--bump <patch|minor|major|none>`** to control the auto-bump level per push.
- **Security**: upgraded `simple-git` past two critical RCE CVEs.

Upgrade existing installs: `skillsync update` (or `npm install -g skillsync-team@latest`)

```
~/.claude/skills/          ←→  shared Git repo  ←→  teammate's ~/.claude/skills/
   your skills                    (truth)              their skills
```

## Install

```bash
npm install -g skillsync-team
```

## Quick Start

### 1. Create a shared repo

Create an empty Git repository on GitHub (or GitLab, Bitbucket, etc.) for your team's skills.

### 2. Connect

```bash
skillsync init git@github.com:your-team/shared-skills.git
```

### 3. Push your best skills

Run `skillsync push` with no argument to open an interactive picker. It shows only the skills that have something to push — new ones and ones with local changes — so the list stays short. Local changes are pre-selected, so usually you just hit enter:

```bash
skillsync push
```

Or push a specific skill by name (still supported):

```bash
skillsync push claudeception
```

Or push all changed skills without the picker:

```bash
skillsync push --all
```

### 4. Your teammates connect and pull

```bash
skillsync init git@github.com:your-team/shared-skills.git
skillsync pull
```

### 5. Enable auto-sync (optional)

```bash
skillsync link
```

Now skills auto-pull at the start of each Claude Code session (1-hour cooldown).

## Commands

| Command | Description |
|---------|-------------|
| `skillsync init <repo-url>` | Connect to a shared skill repository |
| `skillsync push [skill-name]` | Push skill(s) to the shared repo. No name → picker. |
| `skillsync pull` | Pull new and updated skills (picker on TTY) |
| `skillsync list` | List all skills with their sync status |
| `skillsync status` | Show detailed sync status and pending changes |
| `skillsync team` | Show team members and their contributions |
| `skillsync link` | Install auto-sync hook for Claude Code |
| `skillsync unlink` | Remove auto-sync hook |
| `skillsync remove <skill-name>` | Remove a skill from shared repo (keeps local) |
| `skillsync update` | Self-update SkillSync to the latest version on npm |
| `skillsync diff <skill>` | Show what would change between your local skill and the shared repo |
| `skillsync archive [skill]` | Archive skill(s) — drops from shared repo and deactivates locally (preserved in `~/.skillsync/archive/`) |
| `skillsync unarchive [skill]` | Restore an archived skill back to `~/.claude/skills/` |
| `skillsync archived` | List archived skills with metadata |
| `skillsync completion <shell>` | Print a tab-completion script for bash, zsh, or fish |

### Push flags

| Flag | Description |
|------|-------------|
| `-a, --all` | Push every changed skill without the picker |
| `-f, --force` | Push even if skill is in your exclude list |
| `-m, --message <msg>` | Custom commit message |
| `-b, --bump <level>` | Auto-bump level when content changed but version didn't: `patch` (default), `minor`, `major`, `none` |

### Pull flags

| Flag | Description |
|------|-------------|
| `-a, --all` | Pull everything, skip the picker |
| `-s, --skill <name>` | Pull only a specific skill |
| `--theirs` | Accept remote version on conflicts |

## Auto Version Bump (2.0)

When you push a skill whose content has changed but whose `version:` in frontmatter
hasn't, SkillSync automatically bumps the version (default: patch) and updates the
`date:` field to today. The change is written into your local `SKILL.md` so the
bump is visible in your working tree.

```
+ my-skill                v0.0.3 → v0.0.4 (auto-bumped)
```

Disable per-push with `--bump none`. Bigger jumps with `--bump minor` or `--bump major`.

If you'd already manually bumped (your frontmatter version is ahead of the registry),
SkillSync respects that — no auto-bump.

## How It Works

SkillSync uses Git as the transport layer. No server, no database, no accounts — just a Git repo your team already knows how to use.

**Push flow:**
1. You run `skillsync push` (picker), `skillsync push my-skill`, or `skillsync push --all`
2. SkillSync copies the selected skill(s) from `~/.claude/skills/` into the shared repo
3. Auto-bumps `version:` and `date:` if content changed but frontmatter didn't (default patch)
4. Updates `registry.json` with metadata (author, version, checksum)
5. Commits once and pushes to remote — even when you select multiple skills

**Pull flow:**
1. You run `skillsync pull` (picker on TTY) or `skillsync pull --all`
2. SkillSync pulls the latest from the shared repo
3. Compares checksums to find new/updated skills
4. You tick which to apply; the picked ones are copied into `~/.claude/skills/` (skips the rest)

**Auto-sync:**
- `skillsync link` installs a Claude Code hook (`UserPromptSubmit`)
- On each session start, it silently pulls the latest skills
- 1-hour cooldown prevents excessive git operations
- Fails silently — never blocks your Claude Code session

## Sync Model

Skills are **opt-in**. You explicitly choose which skills to share:

```bash
# Share specific skills
skillsync push my-useful-skill

# Keep personal skills local (never pushed)
# They just stay in ~/.claude/skills/ untouched
```

You can also exclude skills permanently:

```json
// ~/.skillsync/config.json
{
  "excludeSkills": ["my-private-project-skill"]
}
```

## Conflict Handling

When you pull and a skill has changed both locally and remotely:

1. The skill appears in the pull picker — uncheck it to keep your local version untouched
2. If you accept it (or use `--all`), your local version is **backed up** to `~/.skillsync/backups/`
3. The remote version overwrites local; you can compare and merge manually from the backup

For Git-level conflicts (rare — two people pushing the same skill simultaneously):

```bash
skillsync pull --theirs    # Accept remote version
skillsync push my-skill --force  # Override with your version
```

## What Gets Synced

Each skill is a directory in `~/.claude/skills/`:

```
my-skill/
├── SKILL.md           # The skill file (YAML frontmatter + markdown)
├── references/        # Optional: supporting docs
├── examples/          # Optional: example files
└── scripts/           # Optional: helper scripts
```

SkillSync copies the **entire directory**, excluding `.git/` and `.DS_Store` files. Symlinks are dereferenced — the actual file content is copied, not the symlink.

## Config

Stored at `~/.skillsync/config.json`:

```json
{
  "repoUrl": "git@github.com:team/shared-skills.git",
  "author": "Omar Nassar",
  "excludeSkills": [],
  "autoSync": false
}
```

## Shared Repo Structure

SkillSync auto-generates the repo structure:

```
shared-skills-repo/
├── README.md              # Auto-generated skill table
├── registry.json          # Machine-readable manifest
└── skills/
    ├── claudeception/
    ├── stripe-api-2026-changes/
    └── ...
```

The `registry.json` tracks metadata for each skill: name, description, author, version, who pushed it, when, file list, and SHA-256 checksum for change detection.

## Works With

- **Claudeception** — Extract skills, then `skillsync push` to share them
- **Any Git host** — GitHub, GitLab, Bitbucket, self-hosted
- **Any team size** — Designed for small teams (2-10 people)

## License

MIT
