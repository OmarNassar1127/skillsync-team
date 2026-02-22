import { readConfig, updateConfig } from '../lib/config.js';
import { removeHook, isHookInstalled } from '../lib/hooks.js';
import { log } from '../lib/logger.js';

export async function unlink() {
  await readConfig();

  if (!await isHookInstalled()) {
    log.info('Auto-sync hook is not installed.');
    return;
  }

  await removeHook();
  await updateConfig({ autoSync: false });

  log.success('Auto-sync hook removed.');
}
