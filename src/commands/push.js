import { join } from 'node:path';
import fs from 'fs-extra';
import { SKILLS_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig, updateConfig } from '../lib/config.js';
import { parseSkillMetadata, computeChecksum, listSkillFiles, copySkillToRepo } from '../lib/skills.js';
import { pullLatest, commitAndPush } from '../lib/git.js';
import { readRegistry, writeRegistry, addSkillToRegistry, generateReadme, registerMember, incrementMemberPush } from '../lib/registry.js';
import { SkillNotFoundError, SkillSyncError } from '../lib/errors.js';
import { log, spinner } from '../lib/logger.js';

export async function push(skillName, options) {
  const config = await readConfig();

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

  log.header(`Pushing skill: ${skillName}`);

  const s1 = spinner('Pulling latest from remote...');
  try {
    await pullLatest();
    s1.succeed('Pulled latest from remote');
  } catch (err) {
    s1.fail('Pull failed');
    throw err;
  }

  const metadata = parseSkillMetadata(skillDir);
  const checksum = await computeChecksum(skillDir);

  const registry = await readRegistry();
  const existing = registry.skills[skillName];

  if (existing && existing.checksum === checksum) {
    log.success('Skill is already up to date in shared repo.');
    return;
  }

  if (existing && existing.pushedBy !== config.author) {
    log.warn(`This skill was last pushed by ${existing.pushedBy}.`);
    log.dim(`Updating with your version (${config.author}).`);
  }

  const files = await listSkillFiles(skillDir);
  const s2 = spinner(`Copying skill files (${files.length} files)...`);
  await copySkillToRepo(skillName, SKILLS_DIR, REPO_SKILLS_DIR);
  s2.succeed(`Copied ${files.length} files`);

  const s3 = spinner('Updating registry...');
  await addSkillToRegistry(registry, skillName, metadata, config.author, files, checksum);
  registerMember(registry, config.author);
  incrementMemberPush(registry, config.author);
  await writeRegistry(registry);
  await generateReadme(registry, config.repoUrl);
  s3.succeed('Updated registry');

  const action = existing ? 'update' : 'push';
  const commitMsg = `${action}: ${skillName} (v${metadata.version}) by ${config.author}`;

  const s4 = spinner('Pushing to remote...');
  const result = await commitAndPush(commitMsg);
  if (result.pushed) {
    s4.succeed(`Committed: ${commitMsg}`);
  } else {
    s4.succeed('No changes to push');
  }

  await updateConfig({ lastPush: new Date().toISOString() });

  log.success('Pushed to remote successfully.');
}
