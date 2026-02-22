import fs from 'fs-extra';
import { CONFIG_FILE, SKILLSYNC_DIR } from './paths.js';
import { NotInitializedError } from './errors.js';

export async function readConfig() {
  if (!await fs.pathExists(CONFIG_FILE)) {
    throw new NotInitializedError();
  }
  return fs.readJson(CONFIG_FILE);
}

export async function writeConfig(data) {
  await fs.ensureDir(SKILLSYNC_DIR);
  await fs.writeJson(CONFIG_FILE, data, { spaces: 2 });
}

export async function updateConfig(updates) {
  const config = await readConfig();
  Object.assign(config, updates);
  await writeConfig(config);
  return config;
}

export async function configExists() {
  return fs.pathExists(CONFIG_FILE);
}
