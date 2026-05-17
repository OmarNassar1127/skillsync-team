import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import { getUpdateInfo, printUpdateBanner } from './lib/version-check.js';

// Fast-path for shell completion — bypass Commander entirely for sub-millisecond responsiveness
if (process.argv[2] === '__complete') {
  const args = process.argv.slice(3);
  const { complete } = await import('./commands/__complete.js');
  await complete(args);
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

const SKIP_UPDATE_BANNER = new Set(['update', 'completion', 'version']);

function wrapAction(fn, commandName) {
  return async (...args) => {
    const updatePromise = SKIP_UPDATE_BANNER.has(commandName)
      ? Promise.resolve(null)
      : getUpdateInfo().catch(() => null);

    try {
      await fn(...args);
      const info = await Promise.race([
        updatePromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 500)),
      ]);
      printUpdateBanner(info);
    } catch (err) {
      if (err.name === 'SkillSyncError') {
        console.error(chalk.red(`\n  Error: ${err.message}`));
        if (err.hint) {
          console.error(chalk.yellow(`  Hint: ${err.hint}`));
        }
        console.error('');
        process.exit(1);
      }
      console.error(chalk.red('\n  Unexpected error:'));
      console.error(err);
      process.exit(2);
    }
  };
}

program
  .name('skillsync')
  .description('Git-native skill sharing for Claude Code teams')
  .version(pkg.version, '-v, --version', 'Output the installed version number');

program
  .command('init')
  .argument('<repo-url>', 'Git URL of the shared skill repository')
  .option('-a, --author <name>', 'Your display name for attribution')
  .description('Connect to a shared skill repository')
  .action(wrapAction(async (repoUrl, options) => {
    const { init } = await import('./commands/init.js');
    await init(repoUrl, options);
  }));

program
  .command('push')
  .argument('[skill-name]', 'Name of the skill to push (omit for interactive picker)')
  .option('-a, --all', 'Push all changed skills, no picker')
  .option('-f, --force', 'Push even if skill is in exclude list')
  .option('-m, --message <msg>', 'Custom commit message')
  .option('-b, --bump <level>', 'Auto-bump level when content changed: patch | minor | major | none', 'patch')
  .description('Push local skill(s) to the shared repository')
  .action(wrapAction(async (skillName, options) => {
    const { push } = await import('./commands/push.js');
    await push(skillName, options);
  }));

program
  .command('pull')
  .option('-a, --all', 'Pull everything, skip the picker')
  .option('-s, --skill <name>', 'Pull only a specific skill')
  .option('--theirs', 'Accept remote version on conflicts')
  .description('Pull new and updated skills from the shared repository')
  .action(wrapAction(async (options) => {
    const { pull } = await import('./commands/pull.js');
    await pull(options);
  }));

program
  .command('list')
  .alias('ls')
  .description('List all skills with their sync status')
  .action(wrapAction(async () => {
    const { list } = await import('./commands/list.js');
    await list();
  }));

program
  .command('status')
  .alias('st')
  .description('Show detailed sync status and pending changes')
  .action(wrapAction(async () => {
    const { status } = await import('./commands/status.js');
    await status();
  }));

program
  .command('link')
  .description('Install auto-sync hook for Claude Code sessions')
  .action(wrapAction(async () => {
    const { link } = await import('./commands/link.js');
    await link();
  }));

program
  .command('unlink')
  .description('Remove auto-sync hook')
  .action(wrapAction(async () => {
    const { unlink } = await import('./commands/unlink.js');
    await unlink();
  }));

program
  .command('team')
  .description('Show team members and their contributions')
  .action(wrapAction(async () => {
    const { team } = await import('./commands/team.js');
    await team();
  }));

program
  .command('diff')
  .argument('<skill-name>', 'Skill to diff against the shared repo')
  .option('--pull', 'Show what would change locally if you pulled (repo → local)')
  .description('Show the diff between your local skill and the shared repo version')
  .action(wrapAction(async (skillName, options) => {
    const { diff } = await import('./commands/diff.js');
    await diff(skillName, options);
  }));

program
  .command('update')
  .option('--check', 'Only check for updates, do not install')
  .option('-f, --force', 'Reinstall even if already on the latest version')
  .description('Update SkillSync itself to the latest version on npm')
  .action(wrapAction(async (options) => {
    const { update } = await import('./commands/update.js');
    await update(options);
  }, 'update'));

program
  .command('remove')
  .argument('<skill-name>', 'Name of the skill to remove from shared repo')
  .description('Remove a skill from the shared repository (keeps local copy)')
  .action(wrapAction(async (skillName) => {
    const { remove } = await import('./commands/remove.js');
    await remove(skillName);
  }));

program
  .command('archive')
  .argument('[skill-name]', 'Name of the skill to archive (omit for picker)')
  .option('-a, --all', 'Archive every local skill, no picker')
  .option('-r, --reason <msg>', 'Reason for archiving (stored in metadata)')
  .option('-m, --message <msg>', 'Custom commit message')
  .description('Archive skill(s) — remove from shared repo + deactivate local copy (preserved in archive)')
  .action(wrapAction(async (skillName, options) => {
    const { archive } = await import('./commands/archive.js');
    await archive(skillName, options);
  }));

program
  .command('unarchive')
  .argument('[skill-name]', 'Name of the archived skill to restore (omit for picker)')
  .option('-a, --all', 'Unarchive everything, no picker')
  .description('Restore an archived skill back to ~/.claude/skills/')
  .action(wrapAction(async (skillName, options) => {
    const { unarchive } = await import('./commands/unarchive.js');
    await unarchive(skillName, options);
  }));

program
  .command('archived')
  .description('List all archived skills with metadata')
  .action(wrapAction(async () => {
    const { archived } = await import('./commands/archived.js');
    await archived();
  }));

program
  .command('search')
  .argument('[query]', 'Search query (omit for interactive search bar)')
  .option('-n, --limit <n>', 'Max results in batch mode (default 8)', (v) => parseInt(v, 10))
  .description('Semantic search across all known skills (offline, local model)')
  .action(wrapAction(async (query, options) => {
    const { searchCmd } = await import('./commands/search.js');
    await searchCmd(query, options);
  }));

program
  .command('completion')
  .argument('[shell]', 'Shell to print completion script for: bash, zsh, fish')
  .description('Print shell tab-completion script. Pipe into your rc file.')
  .action(wrapAction(async (shell) => {
    const { completion } = await import('./commands/completion.js');
    await completion(shell);
  }, 'completion'));

program
  .command('version')
  .alias('v')
  .description('Show the installed SkillSync version')
  .action(wrapAction(async () => {
    console.log(`  skillsync-team v${pkg.version}`);
  }, 'version'));

program.parse();
