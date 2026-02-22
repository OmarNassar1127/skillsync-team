# SkillSync

**Git-native skill sharing for Claude Code teams.**

You and your team use [Claudeception](https://github.com/OmarNassar1127/Claudeception) to extract reusable skills from work sessions. But those skills are siloed on individual machines. SkillSync bridges the gap — a shared Git repo as the single source of truth, a CLI to push and pull, and an auto-sync hook so everyone stays current.

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

```bash
skillsync push claudeception
skillsync push stripe-api-2026-changes
skillsync push supabase-react-auth
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
| `skillsync push <skill-name>` | Push a local skill to the shared repo |
| `skillsync pull` | Pull new and updated skills from shared repo |
| `skillsync list` | List all skills with their sync status |
| `skillsync status` | Show detailed sync status and pending changes |
| `skillsync team` | Show team members and their contributions |
| `skillsync link` | Install auto-sync hook for Claude Code |
| `skillsync unlink` | Remove auto-sync hook |
| `skillsync remove <skill-name>` | Remove a skill from shared repo (keeps local) |

## How It Works

SkillSync uses Git as the transport layer. No server, no database, no accounts — just a Git repo your team already knows how to use.

**Push flow:**
1. You run `skillsync push my-skill`
2. SkillSync copies `~/.claude/skills/my-skill/` into the shared repo
3. Updates `registry.json` with metadata (author, version, checksum)
4. Commits and pushes to remote

**Pull flow:**
1. You run `skillsync pull`
2. SkillSync pulls the latest from the shared repo
3. Compares checksums to find new/updated skills
4. Copies them into your `~/.claude/skills/`

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

1. Your local version is **backed up** to `~/.skillsync/backups/`
2. The remote version overwrites local
3. You can compare and merge manually if needed

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

SkillSync copies the **entire directory**, excluding `.git/` and `.DS_Store` files.

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
