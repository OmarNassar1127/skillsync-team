import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

function wrapAction(fn) {
  return async (...args) => {
    try {
      await fn(...args);
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
  .version(pkg.version);

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
  .argument('<skill-name>', 'Name of the skill to push')
  .option('-f, --force', 'Push even if skill is in exclude list')
  .option('-m, --message <msg>', 'Custom commit message')
  .description('Push a local skill to the shared repository')
  .action(wrapAction(async (skillName, options) => {
    const { push } = await import('./commands/push.js');
    await push(skillName, options);
  }));

program
  .command('pull')
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
  .command('remove')
  .argument('<skill-name>', 'Name of the skill to remove from shared repo')
  .description('Remove a skill from the shared repository (keeps local copy)')
  .action(wrapAction(async (skillName) => {
    const { remove } = await import('./commands/remove.js');
    await remove(skillName);
  }));

program.parse();
