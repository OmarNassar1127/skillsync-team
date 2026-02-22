import fs from 'fs-extra';
import { join } from 'node:path';
import chalk from 'chalk';
import { SKILLS_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig } from '../lib/config.js';
import { readRegistry } from '../lib/registry.js';
import { listLocalSkills, computeChecksum, listSkillFiles } from '../lib/skills.js';
import { log } from '../lib/logger.js';

export async function status() {
  const config = await readConfig();
  const registry = await readRegistry();
  const localSkills = await listLocalSkills();

  const localNames = new Set(localSkills.map(s => s.name));
  const remoteNames = new Set(Object.keys(registry.skills));

  const modified = [];
  const available = [];
  const upToDate = [];

  for (const skill of localSkills) {
    if (!remoteNames.has(skill.name)) continue;

    const remoteEntry = registry.skills[skill.name];
    const repoDir = join(REPO_SKILLS_DIR, skill.name);

    if (!await fs.pathExists(repoDir)) continue;

    const localChecksum = await computeChecksum(skill.path);
    const repoChecksum = await computeChecksum(repoDir);

    if (localChecksum === repoChecksum) {
      upToDate.push(skill.name);
    } else {
      const localFiles = await listSkillFiles(skill.path);
      const repoFiles = await listSkillFiles(repoDir);

      const allFiles = new Set([...localFiles, ...repoFiles]);
      const changes = [];

      for (const file of allFiles) {
        const localPath = join(skill.path, file);
        const repoPath = join(repoDir, file);
        const localExists = await fs.pathExists(localPath);
        const repoExists = await fs.pathExists(repoPath);

        if (localExists && !repoExists) {
          changes.push({ type: 'A', file });
        } else if (!localExists && repoExists) {
          changes.push({ type: 'D', file });
        } else {
          const localContent = await fs.readFile(localPath, 'utf8');
          const repoContent = await fs.readFile(repoPath, 'utf8');
          if (localContent !== repoContent) {
            changes.push({ type: 'M', file });
          }
        }
      }

      if (changes.length > 0) {
        modified.push({ name: skill.name, changes });
      } else {
        upToDate.push(skill.name);
      }
    }
  }

  for (const name of remoteNames) {
    if (!localNames.has(name)) {
      available.push({
        name,
        pushedBy: registry.skills[name].pushedBy,
      });
    }
  }

  const lastPull = config.lastPull
    ? new Date(config.lastPull).toLocaleString()
    : 'never';

  log.header(`Status (last pull: ${lastPull})`);

  if (modified.length > 0) {
    log.newline();
    log.plain(chalk.bold('Modified locally (push to share):'));
    for (const m of modified) {
      log.plain(`  ${chalk.cyan(m.name + '/')}`);
      for (const c of m.changes) {
        const color = c.type === 'A' ? chalk.green : c.type === 'D' ? chalk.red : chalk.yellow;
        log.plain(`    ${color(c.type)}  ${c.file}`);
      }
    }
  }

  if (available.length > 0) {
    log.newline();
    log.plain(chalk.bold('Available remotely (pull to get):'));
    for (const a of available) {
      log.plain(`  ${chalk.cyan(a.name + '/')}  ${chalk.dim(`(new, by ${a.pushedBy})`)}`);
    }
  }

  if (upToDate.length > 0) {
    log.newline();
    log.dim(`Up to date: ${upToDate.length} skills`);
  }

  if (modified.length === 0 && available.length === 0) {
    log.newline();
    log.success('Everything is in sync.');
  }
}
