import { join } from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { SKILLS_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig, updateConfig } from '../lib/config.js';
import {
  parseSkillMetadata,
  computeChecksum,
  listSkillFiles,
  copySkillToRepo,
  listLocalSkills,
  bumpSkillVersion,
} from '../lib/skills.js';
import { pullLatest, commitAndPush } from '../lib/git.js';
import {
  readRegistry,
  writeRegistry,
  addSkillToRegistry,
  generateReadme,
  registerMember,
  incrementMemberPush,
} from '../lib/registry.js';
import { SkillNotFoundError, SkillSyncError } from '../lib/errors.js';
import { log, spinner } from '../lib/logger.js';
import { pickSkillsToPush } from '../lib/picker.js';

const VALID_BUMP_LEVELS = new Set(['patch', 'minor', 'major', 'none']);

async function classifySkill(skill, registry, config) {
  const skillDir = skill.path;
  const localChecksum = await computeChecksum(skillDir);
  const existing = registry.skills[skill.name];

  let status;
  if (!existing) {
    status = 'new';
  } else if (existing.checksum === localChecksum) {
    const repoDir = join(REPO_SKILLS_DIR, skill.name);
    if (await fs.pathExists(repoDir)) {
      const repoChecksum = await computeChecksum(repoDir);
      status = repoChecksum === localChecksum ? 'synced' : 'changed';
    } else {
      status = 'synced';
    }
  } else {
    status = 'changed';
  }

  return {
    name: skill.name,
    path: skillDir,
    metadata: skill.metadata,
    version: skill.metadata.version,
    excluded: config.excludeSkills?.includes(skill.name) || false,
    status,
    localChecksum,
    existing,
    preselect: status === 'changed' || status === 'new',
  };
}

async function gatherCandidates(config, registry) {
  const local = await listLocalSkills();
  const rows = [];
  for (const s of local) {
    rows.push(await classifySkill(s, registry, config));
  }
  return rows;
}

function resolveBumpLevel(options) {
  const level = options.bump || 'patch';
  if (!VALID_BUMP_LEVELS.has(level)) {
    throw new SkillSyncError(
      `Invalid --bump level: ${level}`,
      'Valid levels: patch, minor, major, none'
    );
  }
  return level;
}

async function pushOne(skillName, options, registry, config, bumpLevel) {
  const skillDir = join(SKILLS_DIR, skillName);
  if (!await fs.pathExists(skillDir)) {
    throw new SkillNotFoundError(skillName);
  }

  if (config.excludeSkills?.includes(skillName) && !options.force) {
    throw new SkillSyncError(
      `Skill "${skillName}" is in your exclude list.`,
      'Use --force to push anyway, or edit ~/.skillsync/config.json'
    );
  }

  let metadata = parseSkillMetadata(skillDir);
  let checksum = await computeChecksum(skillDir);
  const existing = registry.skills[skillName];

  if (existing && existing.checksum === checksum) {
    return { skillName, status: 'unchanged' };
  }

  let bumpInfo = null;
  if (
    existing &&
    bumpLevel !== 'none' &&
    metadata.version === existing.skillVersion
  ) {
    bumpInfo = bumpSkillVersion(skillDir, bumpLevel, { updateDate: true });
    metadata = parseSkillMetadata(skillDir);
    checksum = await computeChecksum(skillDir);
  }

  const files = await listSkillFiles(skillDir);
  await copySkillToRepo(skillName, SKILLS_DIR, REPO_SKILLS_DIR);

  await addSkillToRegistry(registry, skillName, metadata, config.author, files, checksum);
  registerMember(registry, config.author);
  incrementMemberPush(registry, config.author);

  return {
    skillName,
    status: existing ? 'updated' : 'created',
    version: metadata.version,
    fileCount: files.length,
    bumpInfo,
    pushedByOther: existing && existing.pushedBy !== config.author ? existing.pushedBy : null,
  };
}

async function resolveSkillNames(skillNameArg, options, config, registry) {
  if (skillNameArg) {
    return [skillNameArg];
  }

  const candidates = await gatherCandidates(config, registry);

  if (candidates.length === 0) {
    log.info('No local skills found in ~/.claude/skills/.');
    return [];
  }

  if (options.all) {
    return candidates
      .filter(c => options.force || !c.excluded)
      .filter(c => c.status !== 'synced')
      .map(c => c.name);
  }

  return pickSkillsToPush(candidates, { allowExcluded: !!options.force });
}

export async function push(skillNameArg, options) {
  const config = await readConfig();
  const bumpLevel = resolveBumpLevel(options);

  const s0 = spinner('Pulling latest from remote...');
  try {
    await pullLatest();
    s0.succeed('Pulled latest from remote');
  } catch (err) {
    s0.fail('Pull failed');
    throw err;
  }

  const registry = await readRegistry();
  const skillNames = await resolveSkillNames(skillNameArg, options, config, registry);

  if (skillNames.length === 0) {
    if (skillNameArg === undefined && !options.all) {
      log.info('Nothing selected. Aborted.');
    }
    return;
  }

  log.header(`Pushing ${skillNames.length} skill${skillNames.length === 1 ? '' : 's'}`);

  const results = [];
  const failures = [];

  for (const name of skillNames) {
    try {
      const result = await pushOne(name, options, registry, config, bumpLevel);
      results.push(result);

      if (result.status === 'unchanged') {
        log.dim(`  · ${name} — already up to date`);
        continue;
      }

      if (result.bumpInfo) {
        log.plain(
          `  ${chalk.green('+')} ${chalk.cyan(name)} ${chalk.dim(
            `v${result.bumpInfo.oldVersion || '?'} → v${result.bumpInfo.newVersion}`
          )} ${chalk.dim('(auto-bumped)')}`
        );
      } else {
        log.plain(
          `  ${chalk.green('+')} ${chalk.cyan(name)} ${chalk.dim(`v${result.version}`)}  ${chalk.dim(`${result.fileCount} files`)}`
        );
      }

      if (result.pushedByOther) {
        log.dim(`      previously pushed by ${result.pushedByOther}`);
      }
    } catch (err) {
      failures.push({ name, err });
      log.error(`  × ${name} — ${err.message}`);
    }
  }

  const changed = results.filter(r => r.status !== 'unchanged');
  if (changed.length === 0) {
    if (failures.length === 0) {
      log.success('Nothing to push — all selected skills already up to date.');
    } else {
      throw new SkillSyncError(
        `Push failed: ${failures.length} skill(s) errored.`,
        'See errors above.'
      );
    }
    return;
  }

  await writeRegistry(registry);
  await generateReadme(registry, config.repoUrl);

  const names = changed.map(r => r.skillName);
  const summary = names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  const action = changed.length === 1 ? (changed[0].status === 'created' ? 'push' : 'update') : 'sync';
  const versions = changed.length === 1 ? ` (v${changed[0].version})` : '';
  const commitMsg = options.message || `${action}: ${summary}${versions} by ${config.author}`;

  const sPush = spinner('Pushing to remote...');
  const result = await commitAndPush(commitMsg);
  if (result.pushed) {
    sPush.succeed(`Pushed: ${commitMsg}`);
  } else {
    sPush.succeed('Nothing to push');
  }

  await updateConfig({ lastPush: new Date().toISOString() });

  if (failures.length > 0) {
    log.warn(`${changed.length} succeeded, ${failures.length} failed.`);
  } else {
    log.success(`Pushed ${changed.length} skill${changed.length === 1 ? '' : 's'} to remote.`);
  }
}
