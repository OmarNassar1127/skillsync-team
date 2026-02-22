import simpleGit from 'simple-git';
import fs from 'fs-extra';
import { REPO_DIR } from './paths.js';
import { GitAuthError, MergeConflictError, RepoNotFoundError } from './errors.js';

let git;

export function getGit() {
  if (!git) {
    git = simpleGit(REPO_DIR);
  }
  return git;
}

export function resetGit() {
  git = null;
}

export async function cloneRepo(url, targetDir) {
  try {
    await simpleGit().clone(url, targetDir);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Authentication') || msg.includes('permission') || msg.includes('publickey')) {
      throw new GitAuthError();
    }
    if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('Repository not found')) {
      throw new RepoNotFoundError(url);
    }
    throw err;
  }
}

export async function isRepoEmpty() {
  try {
    const g = getGit();
    const log = await g.log();
    return log.total === 0;
  } catch {
    return true;
  }
}

export async function pullLatest(strategy) {
  const g = getGit();
  try {
    const options = ['--no-rebase'];
    if (strategy === 'theirs') {
      options.push('-X', 'theirs');
    }
    return await g.pull(options);
  } catch (err) {
    const msg = err.message || '';
    // Handle fresh repo with no remote tracking branch
    if (msg.includes('no such ref was fetched') || msg.includes('no tracking information')) {
      return { files: [], summary: { changes: 0 } };
    }
    if (msg.includes('CONFLICT') || msg.includes('Merge conflict')) {
      await g.merge(['--abort']).catch(() => {});
      const status = await g.status();
      throw new MergeConflictError(status.conflicted);
    }
    if (msg.includes('Authentication') || msg.includes('publickey')) {
      throw new GitAuthError();
    }
    throw err;
  }
}

export async function commitAndPush(message) {
  const g = getGit();
  await g.add('-A');
  const status = await g.status();

  if (status.isClean()) {
    return { pushed: false, reason: 'nothing to commit' };
  }

  await g.commit(message);
  await g.push();
  return { pushed: true };
}

export async function getStatus() {
  return getGit().status();
}

export async function getLog(n = 20) {
  try {
    return await getGit().log([`-${n}`]);
  } catch {
    return { total: 0, all: [] };
  }
}

export async function initRepo(targetDir) {
  await fs.ensureDir(targetDir);
  const g = simpleGit(targetDir);
  await g.init();
  return g;
}

export async function getGitUserName() {
  try {
    const g = simpleGit();
    const name = await g.getConfig('user.name');
    return name.value || null;
  } catch {
    return null;
  }
}
