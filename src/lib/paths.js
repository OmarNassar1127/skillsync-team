import { homedir } from 'node:os';
import { join } from 'node:path';

export const HOME = homedir();
export const CLAUDE_DIR = join(HOME, '.claude');
export const SKILLS_DIR = join(CLAUDE_DIR, 'skills');
export const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
export const SKILLSYNC_DIR = join(HOME, '.skillsync');
export const CONFIG_FILE = join(SKILLSYNC_DIR, 'config.json');
export const REPO_DIR = join(SKILLSYNC_DIR, 'repo');
export const REPO_SKILLS_DIR = join(REPO_DIR, 'skills');
export const REGISTRY_FILE = join(REPO_DIR, 'registry.json');
export const REPO_README = join(REPO_DIR, 'README.md');
export const HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
export const HOOK_SCRIPT = join(HOOKS_DIR, 'skillsync-auto-pull.sh');
export const LOCK_FILE = join(SKILLSYNC_DIR, '.pull-lock');
export const BACKUPS_DIR = join(SKILLSYNC_DIR, 'backups');
