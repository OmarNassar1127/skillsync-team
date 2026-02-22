import fs from 'fs-extra';
import { createInterface } from 'node:readline';
import { SKILLSYNC_DIR, REPO_DIR, REPO_SKILLS_DIR } from '../lib/paths.js';
import { configExists, readConfig, writeConfig } from '../lib/config.js';
import { cloneRepo, getGit, resetGit, isRepoEmpty, commitAndPush } from '../lib/git.js';
import { readRegistry, writeRegistry, generateReadme } from '../lib/registry.js';
import { getGitUserName } from '../lib/git.js';
import { log, spinner } from '../lib/logger.js';

async function prompt(question, defaultValue) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const display = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`  ${question}${display}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

export async function init(repoUrl, options) {
  if (await configExists()) {
    const existing = await readConfig();
    if (existing.repoUrl === repoUrl) {
      log.info('Already initialized with this repo.');
      log.dim(`Repo: ${repoUrl}`);
      return;
    }
    log.warn(`Switching from ${existing.repoUrl}`);
    log.warn('Removing existing repo clone...');
    await fs.remove(REPO_DIR);
    resetGit();
  }

  await fs.ensureDir(SKILLSYNC_DIR);

  const s = spinner('Cloning shared skill repo...');
  let cloneSucceeded = false;
  try {
    await cloneRepo(repoUrl, REPO_DIR);
    cloneSucceeded = true;
    s.succeed('Cloned shared skill repo');
  } catch (err) {
    s.fail('Clone failed');

    if (err.message?.includes('empty repository') || err.message?.includes('empty')) {
      cloneSucceeded = false;
    } else {
      throw err;
    }
  }

  // Check if repo is empty (cloned but no commits, or clone failed due to empty)
  const isEmpty = !cloneSucceeded || await isRepoEmpty();
  if (isEmpty) {
    log.info('Repository is empty. Initializing structure...');

    if (!cloneSucceeded) {
      await fs.ensureDir(REPO_DIR);
    }

    const simpleGitMod = (await import('simple-git')).default;
    const g = simpleGitMod(REPO_DIR);

    if (!cloneSucceeded) {
      await g.init();
      await g.addRemote('origin', repoUrl);
    }

    await fs.ensureDir(REPO_SKILLS_DIR);
    const registry = { version: 1, lastUpdated: null, skills: {} };
    await writeRegistry(registry);
    await generateReadme(registry, repoUrl);
    await fs.writeFile(`${REPO_SKILLS_DIR}/.gitkeep`, '');

    await g.add('-A');
    await g.commit('Initial SkillSync structure');
    try {
      await g.push(['-u', 'origin', 'main']);
    } catch {
      try {
        await g.push(['-u', 'origin', 'master']);
      } catch {
        await g.push(['--set-upstream', 'origin', 'HEAD']);
      }
    }
    resetGit();
    log.success('Pushed initial structure to remote');
  }

  let authorName = options.author;
  if (!authorName) {
    const gitName = await getGitUserName();
    authorName = await prompt('Your name for skill attribution', gitName || '');
  }

  if (!authorName) {
    authorName = 'Anonymous';
  }

  await writeConfig({
    repoUrl,
    author: authorName,
    excludeSkills: [],
    autoSync: false,
    lastPull: new Date().toISOString(),
    lastPush: null,
  });

  const registry = await readRegistry();
  const skillCount = Object.keys(registry.skills).length;

  log.newline();
  log.success(`Connected to ${repoUrl}`);
  log.info(`Author: ${authorName}`);
  log.info(`Remote skills available: ${skillCount}`);
  log.newline();

  if (skillCount === 0) {
    log.dim('This is a new shared repo. Push your first skill:');
    log.dim('  skillsync push <skill-name>');
  } else {
    log.dim("Run 'skillsync pull' to download shared skills.");
  }
}
