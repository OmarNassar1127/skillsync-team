import chalk from 'chalk';
import { readConfig } from '../lib/config.js';
import { readRegistry } from '../lib/registry.js';
import { log } from '../lib/logger.js';

export async function team() {
  const config = await readConfig();
  const registry = await readRegistry();

  const members = Object.values(registry.members || {});

  if (members.length === 0) {
    log.info('No team members yet.');
    log.dim('Members are registered when they run skillsync init or push.');
    return;
  }

  members.sort((a, b) => b.skillsPushed - a.skillsPushed);

  log.header(`Team (${members.length} members)`);

  for (const m of members) {
    const isYou = m.name === config.author ? chalk.dim(' (you)') : '';
    const skills = m.skillsPushed === 1 ? '1 skill pushed' : `${m.skillsPushed} skills pushed`;
    const joined = m.joinedAt ? `joined ${m.joinedAt.split('T')[0]}` : '';
    log.skill(m.name + isYou, `${chalk.dim(skills)}  ${chalk.dim(joined)}`);
  }

  // Show which skills each member pushed
  const skills = Object.values(registry.skills || {});
  if (skills.length > 0) {
    const byMember = {};
    for (const s of skills) {
      if (!byMember[s.pushedBy]) byMember[s.pushedBy] = [];
      byMember[s.pushedBy].push(s.name);
    }

    log.header('Skills by member');
    for (const [member, skillNames] of Object.entries(byMember).sort()) {
      log.plain(`  ${chalk.cyan(member)}`);
      for (const name of skillNames.sort()) {
        log.plain(`    ${chalk.dim('·')} ${name}`);
      }
    }
  }
}
