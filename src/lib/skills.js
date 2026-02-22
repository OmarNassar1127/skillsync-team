import fs from 'fs-extra';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { SKILLS_DIR } from './paths.js';

const EXCLUDE_PATTERNS = ['.git', '.DS_Store', 'node_modules'];

function shouldExclude(name) {
  return EXCLUDE_PATTERNS.includes(name);
}

export function findSkillFile(skillDir) {
  for (const name of ['SKILL.md', 'skill.md']) {
    const filePath = join(skillDir, name);
    if (fs.existsSync(filePath)) {
      return { path: filePath, filename: name };
    }
  }
  return null;
}

export function parseSkillMetadata(skillDir) {
  const skillFile = findSkillFile(skillDir);
  const dirName = skillDir.split('/').pop();

  if (!skillFile) {
    return {
      name: dirName,
      description: '',
      author: 'unknown',
      version: '0.0.0',
      date: new Date().toISOString().split('T')[0],
      hasAllowedTools: false,
      skillFile: null,
    };
  }

  const raw = fs.readFileSync(skillFile.path, 'utf8');
  const { data, content } = matter(raw);

  const hasData = data && Object.keys(data).length > 0;

  let description = '';
  if (hasData && data.description) {
    description = typeof data.description === 'string'
      ? data.description.trim()
      : String(data.description).trim();
  } else {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    description = lines.slice(0, 3).join(' ').trim().slice(0, 300);
  }

  return {
    name: (hasData && data.name) || dirName,
    description,
    author: (hasData && data.author) || 'unknown',
    version: (hasData && data.version) || '0.0.0',
    date: (hasData && data.date) ? String(data.date).split('T')[0] : new Date().toISOString().split('T')[0],
    hasAllowedTools: hasData && Array.isArray(data['allowed-tools']),
    skillFile: skillFile.filename,
  };
}

export async function listLocalSkills() {
  if (!await fs.pathExists(SKILLS_DIR)) {
    return [];
  }

  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldExclude(entry.name)) continue;

    const skillDir = join(SKILLS_DIR, entry.name);
    const metadata = parseSkillMetadata(skillDir);
    skills.push({
      name: entry.name,
      path: skillDir,
      metadata,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function walkDir(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldExclude(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await walkDir(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

export async function computeChecksum(skillDir) {
  const files = await walkDir(skillDir);
  files.sort();

  const hash = createHash('sha256');
  for (const file of files) {
    const relPath = relative(skillDir, file);
    hash.update(relPath);
    const content = await fs.readFile(file);
    hash.update(content);
  }

  return 'sha256:' + hash.digest('hex');
}

export async function listSkillFiles(skillDir) {
  const files = await walkDir(skillDir);
  return files.map(f => relative(skillDir, f)).sort();
}

export async function copySkillToRepo(skillName, skillsDir, repoSkillsDir) {
  const src = join(skillsDir, skillName);
  const dest = join(repoSkillsDir, skillName);

  await fs.ensureDir(dest);
  await fs.copy(src, dest, {
    overwrite: true,
    filter: (srcPath) => {
      const name = srcPath.split('/').pop();
      return !shouldExclude(name);
    },
  });
}

export async function copySkillFromRepo(skillName, repoSkillsDir, skillsDir) {
  const src = join(repoSkillsDir, skillName);
  const dest = join(skillsDir, skillName);

  await fs.ensureDir(dest);
  await fs.copy(src, dest, {
    overwrite: true,
    filter: (srcPath) => {
      const name = srcPath.split('/').pop();
      return !shouldExclude(name);
    },
  });
}

export async function backupSkill(skillName, skillsDir, backupsDir) {
  const src = join(skillsDir, skillName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(backupsDir, `${skillName}-${timestamp}`);

  await fs.ensureDir(backupsDir);
  await fs.copy(src, dest, {
    filter: (srcPath) => {
      const name = srcPath.split('/').pop();
      return !shouldExclude(name);
    },
  });

  return dest;
}
