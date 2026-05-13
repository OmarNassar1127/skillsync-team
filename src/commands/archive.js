import { join } from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { SKILLS_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig, updateConfig } from '../lib/config.js';
import {
  parseSkillMetadata,
  computeChecksum,
  listLocalSkills,
  archiveSkill,
  getSkillTimestamps,
  effectiveSortTime,
} from '../lib/skills.js';
import { pullLatest, commitAndPush } from '../lib/git.js';
import {
  readRegistry,
  writeRegistry,
  removeSkillFromRegistry,
  generateReadme,
} from '../lib/registry.js';
import { log, spinner } from '../lib/logger.js';
import { pickSkillsToArchive } from '../lib/picker.js';

async function gatherArchiveCandidates(registry) {
  const local = await listLocalSkills();
  const rows = [];
  for (const s of local) {
    const ts = await getSkillTimestamps(s.path);
    rows.push({
      name: s.name,
      path: s.path,
      version: s.metadata.version,
      shared: !!registry.skills[s.name],
      bornAt: ts.bornAt,
      newestMtime: ts.newestMtime,
    });
  }
  rows.sort((a, b) => effectiveSortTime(b) - effectiveSortTime(a));
  return rows;
}

async function resolveSkillNames(skillNameArg, options, registry) {
  if (skillNameArg) return [skillNameArg];

  const candidates = await gatherArchiveCandidates(registry);
  if (candidates.length === 0) {
    log.info('No local skills to archive.');
    return [];
  }

  if (options.all) return candidates.map(c => c.name);

  const selected = await pickSkillsToArchive(candidates);
  if (selected.length === 0) {
    log.info('Nothing selected. Aborted.');
  }
  return selected;
}

export async function archive(skillNameArg, options) {
  const config = await readConfig();

  const s0 = spinner('Pulling latest from remote...');
  try {
    await pullLatest();
    s0.succeed('Pulled latest from remote');
  } catch (err) {
    s0.fail('Pull failed');
    throw err;
  }

  const registry = await readRegistry();
  const skillNames = await resolveSkillNames(skillNameArg, options, registry);

  if (skillNames.length === 0) return;

  log.header(`Archiving ${skillNames.length} skill${skillNames.length === 1 ? '' : 's'}`);

  const archivedFromRepo = [];
  const archiveResults = [];
  const failures = [];

  for (const name of skillNames) {
    try {
      const skillDir = join(SKILLS_DIR, name);
      if (!await fs.pathExists(skillDir)) {
        log.error(`  × ${name} — not found locally`);
        continue;
      }

      const metadata = parseSkillMetadata(skillDir);
      const checksum = await computeChecksum(skillDir);
      const wasShared = !!registry.skills[name];

      // 1. Move local files to archive FIRST. If this fails, nothing else has been touched.
      const result = await archiveSkill(name, {
        reason: options.reason,
        archivedBy: config.author,
        version: metadata.version,
        checksum,
        wasShared,
      });
      archiveResults.push({ name, ...result });

      // 2. Now mutate registry / delete repo dir. The local copy is safely in archive.
      if (wasShared) {
        const repoDir = join(REPO_SKILLS_DIR, name);
        if (await fs.pathExists(repoDir)) {
          await fs.remove(repoDir);
        }
        await removeSkillFromRegistry(registry, name);
        archivedFromRepo.push(name);
      }

      log.plain(
        `  ${chalk.yellow('▽')} ${chalk.cyan(name)} ${chalk.dim(`v${metadata.version}`)} ${chalk.dim(wasShared ? '(removed from shared repo)' : '(local-only)')}`
      );
    } catch (err) {
      failures.push({ name, err });
      log.error(`  × ${name} — ${err.message}`);
    }
  }

  if (archivedFromRepo.length > 0) {
    await writeRegistry(registry);
    await generateReadme(registry, config.repoUrl);

    const summary = archivedFromRepo.length <= 3
      ? archivedFromRepo.join(', ')
      : `${archivedFromRepo.slice(0, 2).join(', ')} and ${archivedFromRepo.length - 2} more`;
    const reasonSuffix = options.reason ? ` — ${options.reason}` : '';
    const commitMsg = options.message || `archive: ${summary}${reasonSuffix} by ${config.author}`;

    const sPush = spinner('Pushing to remote...');
    const result = await commitAndPush(commitMsg);
    if (result.pushed) {
      sPush.succeed(`Pushed: ${commitMsg}`);
    } else {
      sPush.succeed('Nothing to push');
    }
  }

  await updateConfig({ lastPush: new Date().toISOString() });

  log.newline();
  if (archiveResults.length > 0) {
    log.success(
      `Archived ${archiveResults.length} skill${archiveResults.length === 1 ? '' : 's'} to ~/.skillsync/archive/.`
    );
    log.dim('Restore with: skillsync unarchive [name]');
  }
  if (failures.length > 0) {
    log.warn(`${failures.length} failed (see errors above).`);
  }
}
