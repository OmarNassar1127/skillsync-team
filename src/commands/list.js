import fs from 'fs-extra';
import { join } from 'node:path';
import chalk from 'chalk';
import { SKILLS_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig } from '../lib/config.js';
import { readRegistry } from '../lib/registry.js';
import { listLocalSkills, computeChecksum } from '../lib/skills.js';
import { log } from '../lib/logger.js';

export async function list() {
  const config = await readConfig();
  const registry = await readRegistry();
  const localSkills = await listLocalSkills();

  const localNames = new Set(localSkills.map(s => s.name));
  const remoteNames = new Set(Object.keys(registry.skills));

  const synced = [];
  const localChanges = [];
  const localOnly = [];
  const remoteOnly = [];

  for (const skill of localSkills) {
    if (remoteNames.has(skill.name)) {
      const remoteEntry = registry.skills[skill.name];
      const localChecksum = await computeChecksum(skill.path);

      if (localChecksum === remoteEntry.checksum) {
        synced.push({ ...skill, remote: remoteEntry });
      } else {
        const repoDir = join(REPO_SKILLS_DIR, skill.name);
        if (await fs.pathExists(repoDir)) {
          const repoChecksum = await computeChecksum(repoDir);
          if (localChecksum === repoChecksum) {
            synced.push({ ...skill, remote: remoteEntry });
          } else {
            localChanges.push({ ...skill, remote: remoteEntry });
          }
        } else {
          localChanges.push({ ...skill, remote: remoteEntry });
        }
      }
    } else {
      localOnly.push(skill);
    }
  }

  for (const name of remoteNames) {
    if (!localNames.has(name)) {
      remoteOnly.push(registry.skills[name]);
    }
  }

  if (synced.length > 0) {
    log.header('Shared (in sync):');
    for (const s of synced) {
      const version = `v${s.remote.skillVersion}`;
      const by = `by ${s.remote.pushedBy}`;
      const ago = timeAgo(s.remote.pushedAt);
      log.skill(s.name, `${chalk.dim(version)}  ${chalk.dim(by)}  ${chalk.dim(ago)}`);
    }
  }

  if (localChanges.length > 0) {
    log.header('Shared (local changes):');
    for (const s of localChanges) {
      log.skill(s.name, chalk.yellow('local changes pending push'));
    }
  }

  if (localOnly.length > 0) {
    log.header('Local only:');
    for (const s of localOnly) {
      const excluded = config.excludeSkills?.includes(s.name);
      const note = excluded ? chalk.dim('(excluded)') : chalk.dim('(not shared)');
      log.skill(s.name, note);
    }
  }

  if (remoteOnly.length > 0) {
    log.header('Remote only:');
    for (const s of remoteOnly) {
      const version = `v${s.skillVersion}`;
      const by = `by ${s.pushedBy}`;
      log.skill(s.name, `${chalk.dim(version)}  ${chalk.dim(by)}  ${chalk.cyan('pull to get')}`);
    }
  }

  if (synced.length === 0 && localChanges.length === 0 && localOnly.length === 0 && remoteOnly.length === 0) {
    log.info('No skills found locally or in shared repo.');
    log.dim('Push a skill: skillsync push <skill-name>');
  }

  log.newline();
  const total = synced.length + localChanges.length + localOnly.length + remoteOnly.length;
  log.dim(`${total} total skills (${synced.length} synced, ${localOnly.length} local, ${remoteOnly.length} remote)`);
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
