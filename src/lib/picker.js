import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { SkillSyncError } from './errors.js';

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function ensureInteractive(action) {
  if (!isInteractive()) {
    throw new SkillSyncError(
      `Interactive ${action} requires a TTY.`,
      `Pass arguments explicitly or use --all (e.g. skillsync ${action} <skill-name> or skillsync ${action} --all).`
    );
  }
}

export async function pickSkillsToPush(rows, { allowExcluded = false } = {}) {
  ensureInteractive('push');

  if (rows.length === 0) {
    return [];
  }

  const choices = rows.map(r => {
    const tags = [];
    if (r.status === 'changed') tags.push(chalk.yellow('local changes'));
    else if (r.status === 'new') tags.push(chalk.green('new'));
    else if (r.status === 'synced') tags.push(chalk.dim('in sync'));
    if (r.excluded) tags.push(chalk.dim('excluded'));

    const version = r.version ? chalk.dim(`v${r.version}`) : '';
    const name = r.name.padEnd(28);
    const tagStr = tags.length > 0 ? `[${tags.join(' · ')}]` : '';

    return {
      name: `${name} ${version}  ${tagStr}`,
      value: r.name,
      checked: false,
      disabled: r.excluded && !allowExcluded ? '(excluded — pass --force)' : false,
    };
  });

  try {
    return await checkbox({
      message: 'Select skills to push (space to toggle, enter to confirm)',
      choices,
      pageSize: 20,
      loop: false,
    });
  } catch (err) {
    if (err.name === 'ExitPromptError') return [];
    throw err;
  }
}

export async function pickSkillsToPull(rows) {
  ensureInteractive('pull');

  if (rows.length === 0) {
    return [];
  }

  const choices = rows.map(r => {
    const tag = r.status === 'new'
      ? chalk.green('new')
      : chalk.yellow('updated');
    const by = chalk.dim(`by ${r.pushedBy}`);
    const version = r.version ? chalk.dim(`v${r.version}`) : '';
    const name = r.name.padEnd(28);

    return {
      name: `${name} ${version}  [${tag}]  ${by}`,
      value: r.name,
      checked: true,
    };
  });

  try {
    return await checkbox({
      message: 'Select skills to pull (space to toggle, enter to confirm)',
      choices,
      pageSize: 20,
      loop: false,
    });
  } catch (err) {
    if (err.name === 'ExitPromptError') return [];
    throw err;
  }
}
