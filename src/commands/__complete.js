import fs from 'fs-extra';
import { SKILLS_DIR, ARCHIVE_DIR, REGISTRY_FILE } from '../lib/paths.js';

const SUBCOMMANDS = [
  'init', 'push', 'pull', 'list', 'status', 'team',
  'link', 'unlink', 'remove', 'diff', 'update',
  'archive', 'unarchive', 'archived', 'completion', 'search', 'version',
];

const SHELLS = ['bash', 'zsh', 'fish'];

async function localSkillNames() {
  if (!await fs.pathExists(SKILLS_DIR)) return [];
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

async function remoteSkillNames() {
  if (!await fs.pathExists(REGISTRY_FILE)) return [];
  try {
    const r = await fs.readJson(REGISTRY_FILE);
    return Object.keys(r.skills || {});
  } catch {
    return [];
  }
}

async function archivedNames() {
  if (!await fs.pathExists(ARCHIVE_DIR)) return [];
  try {
    const entries = await fs.readdir(ARCHIVE_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

// Reject anything containing shell metacharacters. Tab completion only
// shows safe names; users with weirdly-named skills can still type the
// name explicitly. This is a critical defense — bash compgen -W expands
// command substitution in candidate strings, so an attacker-controlled
// skill name with $(...) could RCE during tab completion.
const SHELL_SAFE = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;

function print(items, partial = '') {
  for (const item of items) {
    if (!SHELL_SAFE.test(item)) continue;
    if (!partial || item.startsWith(partial)) {
      process.stdout.write(item + '\n');
    }
  }
}

export async function complete(args) {
  // args layout: [subcommand?, ...positional, partial-or-empty]
  // Empty args / single arg → completing subcommand itself
  if (args.length <= 1) {
    print(SUBCOMMANDS, args[0] || '');
    return;
  }

  const subcommand = args[0];
  const partial = args[args.length - 1] || '';

  switch (subcommand) {
    case 'push':
    case 'archive':
      print(await localSkillNames(), partial);
      return;
    case 'remove':
      print(await remoteSkillNames(), partial);
      return;
    case 'unarchive':
      print(await archivedNames(), partial);
      return;
    case 'diff': {
      const all = new Set([...(await localSkillNames()), ...(await remoteSkillNames())]);
      print([...all].sort(), partial);
      return;
    }
    case 'completion':
      print(SHELLS, partial);
      return;
    default:
      // No positional completion for other subcommands
      return;
  }
}
