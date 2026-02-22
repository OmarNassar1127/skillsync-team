import { readConfig, updateConfig } from '../lib/config.js';
import { installHook, isHookInstalled } from '../lib/hooks.js';
import { log } from '../lib/logger.js';

export async function link() {
  await readConfig();

  if (await isHookInstalled()) {
    log.info('Auto-sync hook is already installed.');
    return;
  }

  await installHook();
  await updateConfig({ autoSync: true });

  log.success('Auto-sync hook installed.');
  log.dim('Skills will auto-pull at the start of each Claude Code session (1hr cooldown).');
  log.dim('Run "skillsync unlink" to remove.');
}
