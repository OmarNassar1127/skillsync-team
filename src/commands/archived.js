import chalk from 'chalk';
import { listArchivedSkills } from '../lib/skills.js';
import { log } from '../lib/logger.js';

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export async function archived() {
  const items = await listArchivedSkills();

  if (items.length === 0) {
    log.info('Archive is empty.');
    log.dim('Archive a skill with: skillsync archive [name]');
    return;
  }

  log.header(`Archived skills (${items.length})`);

  for (const item of items) {
    const m = item.meta || {};
    const version = m.lastVersion ? chalk.dim(`v${m.lastVersion}`) : '';
    const ago = m.archivedAt ? chalk.dim(timeAgo(m.archivedAt)) : '';
    const by = m.archivedBy ? chalk.dim(`by ${m.archivedBy}`) : '';
    const wasShared = m.wasShared ? chalk.dim('(was shared)') : chalk.dim('(local-only)');

    log.plain(`  ${chalk.cyan(item.entry.padEnd(28))} ${version}  ${by}  ${ago}  ${wasShared}`);
    if (m.reason) {
      log.plain(`    ${chalk.dim('· ' + m.reason)}`);
    }
  }

  log.newline();
  log.dim(`Stored at ~/.skillsync/archive/. Run "skillsync unarchive [name]" to restore.`);
}
