import fs from 'fs-extra';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { REPO_SKILLS_DIR } from '../lib/paths.js';
import { readConfig } from '../lib/config.js';
import { pullLatest, commitAndPush } from '../lib/git.js';
import { readRegistry, writeRegistry, removeSkillFromRegistry, generateReadme } from '../lib/registry.js';
import { SkillNotFoundError } from '../lib/errors.js';
import { log, spinner } from '../lib/logger.js';

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} [y/N]: `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function remove(skillName) {
  const config = await readConfig();

  const registry = await readRegistry();
  if (!registry.skills[skillName]) {
    throw new SkillNotFoundError(skillName, 'remote');
  }

  const ok = await confirm(`Remove "${skillName}" from shared repo? (local copy will be kept)`);
  if (!ok) {
    log.info('Cancelled.');
    return;
  }

  const s1 = spinner('Pulling latest...');
  await pullLatest();
  s1.succeed('Pulled latest');

  const skillDir = join(REPO_SKILLS_DIR, skillName);
  if (await fs.pathExists(skillDir)) {
    await fs.remove(skillDir);
  }

  await removeSkillFromRegistry(registry, skillName);
  await writeRegistry(registry);
  await generateReadme(registry, config.repoUrl);

  const commitMsg = `remove: ${skillName} by ${config.author}`;
  const s2 = spinner('Pushing to remote...');
  await commitAndPush(commitMsg);
  s2.succeed(`Removed ${skillName} from shared repo`);

  log.success('Skill removed from shared repo. Local copy preserved.');
}
