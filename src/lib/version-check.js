import fs from 'fs-extra';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import semver from 'semver';
import chalk from 'chalk';
import { UPDATE_CHECK_FILE, SKILLSYNC_DIR } from './paths.js';

const REGISTRY_URL = 'https://registry.npmjs.org/skillsync-team/latest';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCurrentVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', 'package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
}

async function readCache() {
  if (!await fs.pathExists(UPDATE_CHECK_FILE)) return null;
  try {
    return await fs.readJson(UPDATE_CHECK_FILE);
  } catch {
    return null;
  }
}

async function writeCache(data) {
  try {
    await fs.ensureDir(SKILLSYNC_DIR);
    await fs.writeJson(UPDATE_CHECK_FILE, data);
  } catch {
    // Cache write failures are silent — never block real work
  }
}

async function fetchLatestWithTimeout(ms = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function getUpdateInfo() {
  const current = getCurrentVersion();
  const cache = await readCache();
  const now = Date.now();

  if (cache && cache.checkedAt && (now - cache.checkedAt) < COOLDOWN_MS) {
    if (cache.latest && semver.gt(cache.latest, current)) {
      return { current, latest: cache.latest };
    }
    return null;
  }

  const latest = await fetchLatestWithTimeout();
  if (!latest) return null;

  await writeCache({ checkedAt: now, latest });

  if (semver.gt(latest, current)) {
    return { current, latest };
  }
  return null;
}

export function printUpdateBanner(info) {
  if (!info) return;
  console.log('');
  console.log(
    `  ${chalk.dim('→')} ${chalk.yellow('SkillSync')} ${chalk.dim(`v${info.current}`)} ${chalk.dim('→')} ${chalk.green(`v${info.latest}`)} ${chalk.dim('available. Run')} ${chalk.cyan('skillsync update')} ${chalk.dim('to install.')}`
  );
}
