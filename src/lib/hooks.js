import fs from 'fs-extra';
import { SETTINGS_FILE, HOOKS_DIR, HOOK_SCRIPT, LOCK_FILE } from './paths.js';

const HOOK_IDENTIFIER = 'skillsync-auto-pull.sh';

const HOOK_SCRIPT_CONTENT = `#!/bin/bash
# SkillSync Auto-Pull Hook
# Installed by: skillsync link
# Pulls latest shared skills at the start of each Claude Code session.

SKILLSYNC_DIR="$HOME/.skillsync"
REPO_DIR="$SKILLSYNC_DIR/repo"
LOCK_FILE="$SKILLSYNC_DIR/.pull-lock"
COOLDOWN=3600  # Only pull once per hour (seconds)

# Check if repo exists
if [ ! -d "$REPO_DIR/.git" ]; then
  exit 0
fi

# Check cooldown
if [ -f "$LOCK_FILE" ]; then
  LAST_PULL=$(cat "$LOCK_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_PULL))
  if [ "$ELAPSED" -lt "$COOLDOWN" ]; then
    exit 0
  fi
fi

# Attempt silent pull
cd "$REPO_DIR" && git pull --quiet 2>/dev/null

if [ $? -eq 0 ]; then
  date +%s > "$LOCK_FILE"

  SKILLS_SRC="$REPO_DIR/skills"
  SKILLS_DST="$HOME/.claude/skills"

  if [ -d "$SKILLS_SRC" ]; then
    for skill_dir in "$SKILLS_SRC"/*/; do
      [ -d "$skill_dir" ] || continue
      skill_name=$(basename "$skill_dir")
      mkdir -p "$SKILLS_DST/$skill_name"
      rsync -a --delete --exclude='.git' --exclude='.DS_Store' \\
        "$skill_dir" "$SKILLS_DST/$skill_name/" 2>/dev/null
    done
  fi

  SKILL_COUNT=$(ls -d "$SKILLS_SRC"/*/ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$SKILL_COUNT" -gt "0" ]; then
    echo "[SkillSync] $SKILL_COUNT shared team skills synced."
  fi
fi
`;

export async function installHook() {
  await fs.ensureDir(HOOKS_DIR);
  await fs.writeFile(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });

  const settings = await readSettings();

  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.UserPromptSubmit) {
    settings.hooks.UserPromptSubmit = [];
  }

  const alreadyInstalled = settings.hooks.UserPromptSubmit.some(entry =>
    entry.hooks?.some(h => h.command?.includes(HOOK_IDENTIFIER))
  );

  if (!alreadyInstalled) {
    settings.hooks.UserPromptSubmit.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: `~/.claude/hooks/${HOOK_IDENTIFIER}`,
        },
      ],
    });
    await writeSettings(settings);
  }
}

export async function removeHook() {
  if (await fs.pathExists(HOOK_SCRIPT)) {
    await fs.remove(HOOK_SCRIPT);
  }

  if (await fs.pathExists(LOCK_FILE)) {
    await fs.remove(LOCK_FILE);
  }

  const settings = await readSettings();

  if (settings.hooks?.UserPromptSubmit) {
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(entry =>
      !entry.hooks?.some(h => h.command?.includes(HOOK_IDENTIFIER))
    );

    if (settings.hooks.UserPromptSubmit.length === 0) {
      delete settings.hooks.UserPromptSubmit;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    await writeSettings(settings);
  }
}

export async function isHookInstalled() {
  if (!await fs.pathExists(SETTINGS_FILE)) return false;
  const settings = await readSettings();
  return settings.hooks?.UserPromptSubmit?.some(entry =>
    entry.hooks?.some(h => h.command?.includes(HOOK_IDENTIFIER))
  ) || false;
}

async function readSettings() {
  if (!await fs.pathExists(SETTINGS_FILE)) {
    return {};
  }
  return fs.readJson(SETTINGS_FILE);
}

async function writeSettings(settings) {
  await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
}
