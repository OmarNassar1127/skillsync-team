import fs from 'fs-extra';
import { join } from 'node:path';
import chalk from 'chalk';
import { SKILLS_DIR, REPO_SKILLS_DIR, BACKUPS_DIR } from '../lib/paths.js';
import { readConfig, updateConfig } from '../lib/config.js';
import { pullLatest } from '../lib/git.js';
import { readRegistry } from '../lib/registry.js';
import { computeChecksum, copySkillFromRepo, backupSkill, getSkillTimestamps, effectiveSortTime, isValidSkillName } from '../lib/skills.js';
import { log, spinner } from '../lib/logger.js';
import { pickSkillsToPull } from '../lib/picker.js';

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

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
  const allRegistryKeys = Object.keys(registry.skills);

  // Filter out any malformed registry keys (path traversal, slashes, null bytes).
  // A malicious shared repo could try to write outside ~/.claude/skills/ via crafted keys.
  const remoteSkills = allRegistryKeys.filter(name => isValidSkillName(name));
  const rejected = allRegistryKeys.length - remoteSkills.length;
  if (rejected > 0) {
    log.warn(`Ignored ${rejected} registry entr${rejected === 1 ? 'y' : 'ies'} with invalid skill name(s). Possible tampering — check the shared repo.`);
  }

  if (remoteSkills.length === 0) {
    log.info('No skills in shared repo yet.');
    return;
  }

  const newRows = [];
  const updatedRows = [];
  const unchangedSkills = [];

  for (const skillName of remoteSkills) {
    if (options.skill && options.skill !== skillName) continue;

    const localDir = join(SKILLS_DIR, skillName);
    const repoDir = join(REPO_SKILLS_DIR, skillName);

    if (!await fs.pathExists(repoDir)) continue;

    if (!await fs.pathExists(localDir)) {
      const ts = await getSkillTimestamps(repoDir);
      newRows.push({
        name: skillName,
        status: 'new',
        version: registry.skills[skillName].skillVersion,
        pushedBy: registry.skills[skillName].pushedBy,
        bornAt: ts.bornAt,
        newestMtime: ts.newestMtime,
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

    const ts = await getSkillTimestamps(repoDir);
    updatedRows.push({
      name: skillName,
      status: 'updated',
      version: registry.skills[skillName].skillVersion,
      pushedBy: registry.skills[skillName].pushedBy,
      bornAt: ts.bornAt,
      newestMtime: ts.newestMtime,
    });
  }

  const candidateRows = [...newRows, ...updatedRows].sort(
    (a, b) => effectiveSortTime(b) - effectiveSortTime(a)
  );

  if (candidateRows.length === 0) {
    await updateConfig({ lastPull: new Date().toISOString() });
    log.success('Everything is up to date.');
    if (unchangedSkills.length > 0) {
      log.dim(`Unchanged: ${unchangedSkills.length} skills`);
    }
    return;
  }

  let selected;
  if (options.all || options.skill || !isInteractive()) {
    selected = candidateRows.map(r => r.name);
  } else {
    selected = await pickSkillsToPull(candidateRows);
    if (selected.length === 0) {
      log.info('Nothing selected. Aborted.');
      return;
    }
  }

  const selectedSet = new Set(selected);
  const newApplied = [];
  const updatedApplied = [];
  const skippedUnsafe = [];

  for (const row of newRows) {
    if (!selectedSet.has(row.name)) continue;
    try {
      await copySkillFromRepo(row.name, REPO_SKILLS_DIR, SKILLS_DIR);
      newApplied.push(row);
    } catch (err) {
      skippedUnsafe.push({ name: row.name, reason: err.message });
    }
  }

  for (const row of updatedRows) {
    if (!selectedSet.has(row.name)) continue;
    try {
      const backupPath = await backupSkill(row.name, SKILLS_DIR, BACKUPS_DIR);
      await copySkillFromRepo(row.name, REPO_SKILLS_DIR, SKILLS_DIR);
      updatedApplied.push({ ...row, backupPath });
    } catch (err) {
      skippedUnsafe.push({ name: row.name, reason: err.message });
    }
  }

  await updateConfig({ lastPull: new Date().toISOString() });

  log.newline();

  if (newApplied.length > 0) {
    log.header('New skills:');
    for (const r of newApplied) {
      log.skill(`+ ${r.name}`, `by ${r.pushedBy}`);
    }
  }

  if (updatedApplied.length > 0) {
    log.header('Updated skills:');
    for (const r of updatedApplied) {
      log.skill(`~ ${r.name}`, `by ${r.pushedBy} (backed up)`);
    }
  }

  if (unchangedSkills.length > 0) {
    log.dim(`\n  Unchanged: ${unchangedSkills.length} skills`);
  }

  if (skippedUnsafe.length > 0) {
    log.warn(`Skipped ${skippedUnsafe.length} unsafe skill(s) — possible tampering in the shared repo:`);
    for (const s of skippedUnsafe) {
      log.skill(chalk.red(s.name), chalk.red(s.reason));
    }
  }

  const skipped = candidateRows.length - selected.length;
  log.newline();
  if (skipped > 0) {
    log.success(
      `Pulled ${newApplied.length} new, ${updatedApplied.length} updated. Skipped ${skipped}.`
    );
  } else {
    log.success(`Pulled ${newApplied.length} new, ${updatedApplied.length} updated skill(s).`);
  }
}
