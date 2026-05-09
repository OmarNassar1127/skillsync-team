import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import semver from 'semver';
import chalk from 'chalk';
import { log, spinner } from '../lib/logger.js';
import { SkillSyncError } from '../lib/errors.js';

const REGISTRY_URL = 'https://registry.npmjs.org/skillsync-team/latest';
const PKG_NAME = 'skillsync-team';

function getCurrentVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

async function fetchLatestVersion() {
  const res = await fetch(REGISTRY_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new SkillSyncError(
      `Could not reach npm registry (HTTP ${res.status}).`,
      'Check your internet connection and try again.'
    );
  }
  const data = await res.json();
  return data.version;
}

function runInstall() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', '-g', `${PKG_NAME}@latest`], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new SkillSyncError(
        `npm install exited with code ${code}.`,
        'On some systems global installs need sudo: sudo npm install -g skillsync-team@latest'
      ));
    });
  });
}

export async function update(options) {
  const current = getCurrentVersion();

  const s = spinner('Checking npm for the latest version...');
  let latest;
  try {
    latest = await fetchLatestVersion();
    s.succeed(`Latest on npm: v${latest}`);
  } catch (err) {
    s.fail('Version check failed');
    throw err;
  }

  log.dim(`Currently installed: v${current}`);

  const cmp = semver.compare(latest, current);

  if (cmp === 0 && !options.force) {
    log.success(`Already on the latest version (v${current}).`);
    return;
  }

  if (cmp < 0) {
    log.warn(`Local v${current} is ahead of npm v${latest}. Nothing to do.`);
    return;
  }

  if (options.check) {
    log.newline();
    log.info(`Update available: ${chalk.dim(`v${current}`)} → ${chalk.green(`v${latest}`)}`);
    log.dim('Run "skillsync update" to install.');
    return;
  }

  log.newline();
  log.info(`Updating: ${chalk.dim(`v${current}`)} → ${chalk.green(`v${latest}`)}`);
  log.newline();

  await runInstall();

  log.newline();
  log.success(`Updated to v${latest}.`);
  log.dim('Run "skillsync --version" to confirm.');
}
