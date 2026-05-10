import chalk from 'chalk';
import { listArchivedSkills, unarchiveSkill } from '../lib/skills.js';
import { log } from '../lib/logger.js';
import { pickSkillsToUnarchive } from '../lib/picker.js';

async function resolveEntries(entryArg, options) {
  const archived = await listArchivedSkills();

  if (entryArg) {
    const match = archived.find(a => a.entry === entryArg || a.meta?.name === entryArg);
    if (!match) {
      log.error(`No archived skill matches "${entryArg}".`);
      log.dim('Run "skillsync archived" to see what is archived.');
      return [];
    }
    return [match.entry];
  }

  if (archived.length === 0) {
    log.info('Archive is empty. Nothing to unarchive.');
    return [];
  }

  if (options.all) return archived.map(a => a.entry);

  const rows = archived.map(a => ({
    entry: a.entry,
    archivedAt: a.meta?.archivedAt,
    reason: a.meta?.reason,
    lastVersion: a.meta?.lastVersion,
  }));

  const selected = await pickSkillsToUnarchive(rows);
  if (selected.length === 0) {
    log.info('Nothing selected. Aborted.');
  }
  return selected;
}

export async function unarchive(entryArg, options) {
  const entries = await resolveEntries(entryArg, options);
  if (entries.length === 0) return;

  log.header(`Unarchiving ${entries.length} skill${entries.length === 1 ? '' : 's'}`);

  const successes = [];
  const failures = [];

  for (const entry of entries) {
    try {
      const result = await unarchiveSkill(entry);
      successes.push(result);
      log.plain(
        `  ${chalk.green('△')} ${chalk.cyan(result.restoredName)} ${chalk.dim(`restored to ~/.claude/skills/`)}`
      );
    } catch (err) {
      failures.push({ entry, err });
      log.error(`  × ${entry} — ${err.message}`);
    }
  }

  log.newline();
  if (successes.length > 0) {
    log.success(
      `Unarchived ${successes.length} skill${successes.length === 1 ? '' : 's'}.`
    );
    log.dim('To re-share with your team, run: skillsync push');
  }
  if (failures.length > 0) {
    log.warn(`${failures.length} failed (see errors above).`);
  }
}
