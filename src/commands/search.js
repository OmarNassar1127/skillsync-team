import { search as inquirerSearch } from '@inquirer/prompts';
import chalk from 'chalk';
import { readConfig } from '../lib/config.js';
import { readRegistry, writeRegistry } from '../lib/registry.js';
import { embedText, cosineSimilarity, isValidEmbedding } from '../lib/semantic.js';
import { log } from '../lib/logger.js';
import { SkillSyncError } from '../lib/errors.js';

const DEFAULT_LIMIT = 8;

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

// Returns top N skills matching the query, scored 0..1 (cosine for semantic).
// Hybrid: exact-substring matches get a 1.0 boost and short-circuit semantic.
async function rankSkills(query, skills, options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  if (!query) {
    return skills.slice(0, limit).map(s => ({ ...s, score: 0 }));
  }

  const q = query.toLowerCase().trim();

  // Lexical pass: substring matches in name or description go first.
  const lexicalHits = [];
  const semanticPool = [];
  for (const s of skills) {
    const haystack = `${s.name} ${s.description || ''}`.toLowerCase();
    if (haystack.includes(q)) {
      lexicalHits.push({ ...s, score: 1.0, matchType: 'lexical' });
    } else {
      semanticPool.push(s);
    }
  }

  // If we have enough lexical hits, skip semantic entirely (super fast).
  if (lexicalHits.length >= limit) {
    return lexicalHits.slice(0, limit);
  }

  // Otherwise embed the query and score the rest.
  let queryEmbedding;
  try {
    queryEmbedding = await embedText(query);
  } catch {
    queryEmbedding = null;
  }

  const semanticHits = [];
  if (queryEmbedding) {
    for (const s of semanticPool) {
      if (!isValidEmbedding(s.descriptionEmbedding)) continue;
      const score = cosineSimilarity(queryEmbedding, s.descriptionEmbedding);
      if (score > 0.15) {
        semanticHits.push({ ...s, score, matchType: 'semantic' });
      }
    }
    semanticHits.sort((a, b) => b.score - a.score);
  }

  return [...lexicalHits, ...semanticHits].slice(0, limit);
}

function formatRow(hit) {
  const score = chalk.dim(hit.score.toFixed(2));
  const name = chalk.cyan(hit.name.padEnd(28));
  const desc = (hit.description || '').slice(0, 80);
  const tag = hit.matchType === 'lexical' ? chalk.green('lex') : chalk.yellow('sem');
  return `${name} ${score} ${chalk.dim('[' + tag + ']')}  ${chalk.dim(desc)}`;
}

function collectSkills(registry) {
  // The registry KEY is the directory name and is what addSkillToRegistry uses.
  // metadata.name (the inner s.name field) can diverge from the key, so we key off
  // the entry key for round-trip persistence to work reliably.
  return Object.entries(registry.skills || {})
    .filter(([, s]) => s)
    .map(([key, s]) => ({
      key,
      name: s.name || key,
      description: s.description || '',
      version: s.skillVersion,
      pushedBy: s.pushedBy,
      descriptionEmbedding: s.descriptionEmbedding,
    }));
}

// Lazy-generate embeddings for skills that don't have one yet.
// Called once per `skillsync search` invocation.
// NOTE: deliberately uses a static log line, NOT an ora spinner — an animated
// spinner running concurrently with the transformers model load floods the
// stdout buffer and can deadlock under a pty (CI, `expect`, some terminals).
async function ensureEmbeddings(skills) {
  const missing = skills.filter(s => !isValidEmbedding(s.descriptionEmbedding) && s.description);
  if (missing.length === 0) return { skills, generated: 0 };

  log.dim(`Generating embeddings for ${missing.length} skill${missing.length === 1 ? '' : 's'}...`);
  for (const sk of missing) {
    try {
      sk.descriptionEmbedding = await embedText(`${sk.name}: ${sk.description}`);
    } catch {
      // Skip — that skill just won't appear in semantic results.
    }
  }
  log.dim(`Generated ${missing.length} embedding${missing.length === 1 ? '' : 's'}.`);
  return { skills, generated: missing.length };
}

// Persist any lazy-generated embeddings back to the registry so future searches are fast.
async function persistEmbeddings(skills, registry) {
  let changed = false;
  for (const s of skills) {
    const reg = registry.skills?.[s.key];
    if (reg && isValidEmbedding(s.descriptionEmbedding) && !isValidEmbedding(reg.descriptionEmbedding)) {
      reg.descriptionEmbedding = s.descriptionEmbedding;
      changed = true;
    }
  }
  if (changed) {
    await writeRegistry(registry);
  }
  return changed;
}

async function runInteractive(skills, registry) {
  // Static message, not an ora spinner — see note on ensureEmbeddings().
  log.dim('Loading semantic model (first run downloads ~25MB)...');
  try {
    await embedText('warmup');
    log.success('Semantic model ready.');
  } catch (err) {
    log.warn('Semantic model failed to load — falling back to lexical search only.');
  }

  await ensureEmbeddings(skills);
  await persistEmbeddings(skills, registry);

  try {
    const selected = await inquirerSearch({
      message: 'Find a skill (type to search, enter to select, esc to cancel)',
      source: async (input) => {
        const hits = await rankSkills(input || '', skills);
        return hits.map(h => ({
          name: formatRow(h),
          value: h.key,
          description: h.description,
        }));
      },
    });

    if (!selected) return;
    showSelected(skills, selected);
  } catch (err) {
    if (err.name === 'ExitPromptError') return;
    throw err;
  }
}

function showSelected(skills, key) {
  const skill = skills.find(s => s.key === key);
  if (!skill) return;
  log.newline();
  log.header(skill.key);
  log.dim(`v${skill.version || '0.0.0'}  ·  by ${skill.pushedBy || 'unknown'}`);
  log.newline();
  log.plain(`  ${skill.description}`);
  log.newline();
  log.dim('Next steps:');
  log.dim(`  skillsync diff ${skill.key}`);
  log.dim(`  skillsync archive ${skill.key}`);
  log.dim(`  open ~/.claude/skills/${skill.key}/SKILL.md`);
}

async function runBatch(query, skills, registry, options) {
  await ensureEmbeddings(skills);
  await persistEmbeddings(skills, registry);

  const hits = await rankSkills(query, skills, { limit: options.limit || DEFAULT_LIMIT });

  if (hits.length === 0) {
    log.info(`No matches for "${query}".`);
    return;
  }

  log.header(`Matches for "${query}":`);
  for (const hit of hits) {
    log.plain(`  ${formatRow(hit)}`);
  }
}

export async function searchCmd(query, options = {}) {
  await readConfig();
  const registry = await readRegistry();
  const skills = collectSkills(registry);

  if (skills.length === 0) {
    log.info('No skills in the registry yet. Push one with: skillsync push <name>');
    return;
  }

  if (query) {
    return runBatch(query, skills, registry, options);
  }

  if (!isInteractive()) {
    throw new SkillSyncError(
      'Interactive search requires a TTY.',
      'Pass a query as an argument: skillsync search "what you are looking for"'
    );
  }

  return runInteractive(skills, registry);
}
