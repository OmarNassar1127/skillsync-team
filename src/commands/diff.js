import fs from 'fs-extra';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { SKILLS_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig } from '../lib/config.js';
import { listSkillFiles, isValidSkillName } from '../lib/skills.js';
import { SkillNotFoundError, SkillSyncError } from '../lib/errors.js';
import { log } from '../lib/logger.js';

function runGitDiff(srcDir, dstDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['diff', '--no-index', '--color=always', srcDir, dstDir],
      { stdio: 'inherit' }
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || code === 1) resolve(code);
      else reject(new Error(`git diff exited with code ${code}`));
    });
  });
}

export async function diff(skillName, options) {
  if (!isValidSkillName(skillName)) {
    throw new SkillSyncError(
      `Invalid skill name: "${skillName}".`,
      'Skill names must contain only letters, digits, dashes, dots, or underscores — and must not be a relative path.'
    );
  }

  await readConfig();

  const localDir = join(SKILLS_DIR, skillName);
  const repoDir = join(REPO_SKILLS_DIR, skillName);

  const localExists = await fs.pathExists(localDir);
  const repoExists = await fs.pathExists(repoDir);

  if (!localExists && !repoExists) {
    throw new SkillNotFoundError(skillName);
  }

  if (!localExists) {
    log.header(`${skillName} (remote only)`);
    log.dim(`Not in ~/.claude/skills/. Pulling would create it.`);
    log.newline();
    const files = await listSkillFiles(repoDir);
    log.plain(chalk.bold(`  ${files.length} file(s) would be added locally:`));
    for (const f of files) {
      log.plain(`    ${chalk.green('+')} ${f}`);
    }
    log.newline();
    log.dim(`Run "skillsync pull -s ${skillName}" to fetch this skill.`);
    return;
  }

  if (!repoExists) {
    log.header(`${skillName} (local only)`);
    log.dim(`Not in shared repo. Pushing would create it.`);
    log.newline();
    const files = await listSkillFiles(localDir);
    log.plain(chalk.bold(`  ${files.length} file(s) would be pushed:`));
    for (const f of files) {
      log.plain(`    ${chalk.green('+')} ${f}`);
    }
    log.newline();
    log.dim(`Run "skillsync push ${skillName}" to share this skill.`);
    return;
  }

  // Both exist — show actual diff
  const direction = options.pull ? 'pull (repo → local)' : 'push (local → repo)';
  log.header(`${skillName} — ${direction}`);

  const [src, dst] = options.pull ? [localDir, repoDir] : [repoDir, localDir];
  const code = await runGitDiff(src, dst);

  if (code === 0) {
    log.newline();
    log.success('No differences. Local and repo are identical.');
  }
}
