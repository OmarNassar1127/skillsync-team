import fs from 'fs-extra';
import { join } from 'node:path';
import { SKILLS_DIR, REPO_SKILLS_DIR, BACKUPS_DIR } from '../lib/paths.js';
import { readConfig, updateConfig } from '../lib/config.js';
import { pullLatest } from '../lib/git.js';
import { readRegistry } from '../lib/registry.js';
import { computeChecksum, copySkillFromRepo, backupSkill } from '../lib/skills.js';
import { log, spinner } from '../lib/logger.js';

export async function pull(options) {
  const config = await readConfig();

  const s1 = spinner('Pulling from shared repo...');
  try {
    await pullLatest(options.theirs ? 'theirs' : undefined);
    s1.succeed('Pulled latest from remote');
  } catch (err) {
    s1.fail('Pull failed');
    throw err;
  }

  const registry = await readRegistry();
  const remoteSkills = Object.keys(registry.skills);

  if (remoteSkills.length === 0) {
    log.info('No skills in shared repo yet.');
    return;
  }

  const newSkills = [];
  const updatedSkills = [];
  const unchangedSkills = [];
  const skippedSkills = [];

  for (const skillName of remoteSkills) {
    if (options.skill && options.skill !== skillName) continue;

    const localDir = join(SKILLS_DIR, skillName);
    const repoDir = join(REPO_SKILLS_DIR, skillName);

    if (!await fs.pathExists(repoDir)) continue;

    if (!await fs.pathExists(localDir)) {
      await copySkillFromRepo(skillName, REPO_SKILLS_DIR, SKILLS_DIR);
      newSkills.push({
        name: skillName,
        pushedBy: registry.skills[skillName].pushedBy,
      });
      continue;
    }

    const localChecksum = await computeChecksum(localDir);
    const remoteChecksum = registry.skills[skillName].checksum;

    if (localChecksum === remoteChecksum) {
      unchangedSkills.push(skillName);
      continue;
    }

    const repoChecksum = await computeChecksum(repoDir);
    if (localChecksum === repoChecksum) {
      unchangedSkills.push(skillName);
      continue;
    }

    const backupPath = await backupSkill(skillName, SKILLS_DIR, BACKUPS_DIR);
    await copySkillFromRepo(skillName, REPO_SKILLS_DIR, SKILLS_DIR);
    updatedSkills.push({
      name: skillName,
      pushedBy: registry.skills[skillName].pushedBy,
      backupPath,
    });
  }

  await updateConfig({ lastPull: new Date().toISOString() });

  log.newline();

  if (newSkills.length > 0) {
    log.header('New skills:');
    for (const s of newSkills) {
      log.skill(`+ ${s.name}`, `by ${s.pushedBy}`);
    }
  }

  if (updatedSkills.length > 0) {
    log.header('Updated skills:');
    for (const s of updatedSkills) {
      log.skill(`~ ${s.name}`, `by ${s.pushedBy} (backed up)`);
    }
  }

  if (unchangedSkills.length > 0) {
    log.dim(`\n  Unchanged: ${unchangedSkills.length} skills`);
  }

  const total = newSkills.length + updatedSkills.length;
  if (total > 0) {
    log.newline();
    log.success(`Pulled ${newSkills.length} new, ${updatedSkills.length} updated skill(s).`);
  } else {
    log.success('Everything is up to date.');
  }
}
