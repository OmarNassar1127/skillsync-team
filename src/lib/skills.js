import fs from 'fs-extra';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import semver from 'semver';
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
    dereference: true,
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
    dereference: true,
    filter: (srcPath) => {
      const name = srcPath.split('/').pop();
      return !shouldExclude(name);
    },
  });
}

export function validateSkillForPush(skillDir) {
  const errors = [];
  const warnings = [];
  const dirName = skillDir.split('/').pop();

  const skillFile = findSkillFile(skillDir);
  if (!skillFile) {
    errors.push('No SKILL.md (or skill.md) file found in the skill directory.');
    return { errors, warnings };
  }

  let raw;
  try {
    raw = fs.readFileSync(skillFile.path, 'utf8');
  } catch (err) {
    errors.push(`Could not read ${skillFile.filename}: ${err.message}`);
    return { errors, warnings };
  }

  let parsed;
  try {
    parsed = matter(raw);
  } catch (err) {
    errors.push(`Malformed YAML frontmatter in ${skillFile.filename}: ${err.message}`);
    return { errors, warnings };
  }

  const data = parsed.data || {};
  const hasFrontmatter = Object.keys(data).length > 0;

  if (!hasFrontmatter) {
    errors.push(`${skillFile.filename} has no YAML frontmatter (expected --- ... --- block at the top).`);
    return { errors, warnings };
  }

  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) {
    errors.push(`Frontmatter is missing a non-empty "description:" field.`);
  } else if (description.length < 10) {
    warnings.push(`"description" is very short (${description.length} chars). Aim for one clear sentence.`);
  }

  if (data.name && typeof data.name === 'string' && data.name !== dirName) {
    warnings.push(`Frontmatter "name: ${data.name}" doesn't match directory name "${dirName}".`);
  }

  if (data.version) {
    const versionStr = String(data.version);
    const coerced = semver.valid(versionStr) || (semver.coerce(versionStr) || {}).version;
    if (!coerced) {
      warnings.push(`"version: ${versionStr}" is not a valid semver. Auto-bump may behave oddly.`);
    }
  }

  return { errors, warnings };
}

function setOrAppendKey(lines, key, newValue) {
  const keyRegex = new RegExp(`^(\\s*${key}:\\s*)(['"]?)([^'"\\n]*?)\\2(\\s*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(keyRegex);
    if (m) {
      lines[i] = `${m[1]}${m[2]}${newValue}${m[2]}${m[4]}`;
      return { found: true, lines };
    }
  }
  lines.push(`${key}: ${newValue}`);
  return { found: false, lines };
}

function readKey(lines, key) {
  const keyRegex = new RegExp(`^\\s*${key}:\\s*(['"]?)([^'"\\n]*?)\\1\\s*$`);
  for (const line of lines) {
    const m = line.match(keyRegex);
    if (m) return m[2].trim();
  }
  return null;
}

export function bumpSkillVersion(skillDir, level = 'patch', { updateDate = true } = {}) {
  const skillFile = findSkillFile(skillDir);
  if (!skillFile) {
    throw new Error(`No SKILL.md found in ${skillDir}`);
  }

  const raw = fs.readFileSync(skillFile.path, 'utf8');
  const fmMatch = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);

  const today = new Date().toISOString().slice(0, 10);

  if (!fmMatch) {
    const newVersion = '0.0.1';
    const dateLine = updateDate ? `\ndate: ${today}` : '';
    const fm = `---\nversion: ${newVersion}${dateLine}\n---\n\n`;
    fs.writeFileSync(skillFile.path, fm + raw);
    return { oldVersion: null, newVersion };
  }

  const fmHeader = fmMatch[1];
  const fmBody = fmMatch[2];
  const fmFooter = fmMatch[3];
  const body = raw.slice(fmMatch[0].length);

  const lines = fmBody.split('\n');
  const currentVersion = readKey(lines, 'version');

  let newVersion;
  if (currentVersion) {
    const coerced = semver.valid(currentVersion) || (semver.coerce(currentVersion) || {}).version;
    if (!coerced) {
      newVersion = '0.0.1';
    } else if (level === 'none') {
      newVersion = coerced;
    } else {
      newVersion = semver.inc(coerced, level);
    }
  } else {
    newVersion = level === 'none' ? '0.0.1' : '0.0.1';
  }

  setOrAppendKey(lines, 'version', newVersion);
  if (updateDate) {
    setOrAppendKey(lines, 'date', today);
  }

  const newFm = fmHeader + lines.join('\n') + fmFooter;
  fs.writeFileSync(skillFile.path, newFm + body);

  return { oldVersion: currentVersion, newVersion };
}

export async function backupSkill(skillName, skillsDir, backupsDir) {
  const src = join(skillsDir, skillName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(backupsDir, `${skillName}-${timestamp}`);

  await fs.ensureDir(backupsDir);
  await fs.copy(src, dest, {
    dereference: true,
    filter: (srcPath) => {
      const name = srcPath.split('/').pop();
      return !shouldExclude(name);
    },
  });

  return dest;
}
