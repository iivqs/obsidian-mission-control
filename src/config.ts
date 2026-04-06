import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { Config } from './types';

const CONFIG_FILE = path.join(os.homedir(), '.obsidian-mc.json');

const DEFAULT_CONFIG: Config = {
  vaults: {},
  defaultVault: '',
  plugins: {
    tasks: true,
    dataview: false,
    templater: false,
  },
};

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;

    const config: Config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      plugins: {
        ...DEFAULT_CONFIG.plugins,
        ...(parsed.plugins ?? {}),
      },
      vaults: parsed.vaults ?? {},
    };

    // Resolve ~ in vault paths
    for (const [name, vaultPath] of Object.entries(config.vaults)) {
      if (vaultPath.startsWith('~/')) {
        config.vaults[name] = path.join(os.homedir(), vaultPath.slice(2));
      } else {
        config.vaults[name] = path.resolve(vaultPath);
      }
    }

    // Set defaultVault to first vault if not specified
    if (!config.defaultVault && Object.keys(config.vaults).length > 0) {
      config.defaultVault = Object.keys(config.vaults)[0];
    }

    return config;
  } catch (err: unknown) {
    // If file doesn't exist, return defaults
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { ...DEFAULT_CONFIG };
    }
    throw err;
  }
}

export function getVaultPath(config: Config, vaultName?: string): string {
  const name = vaultName ?? config.defaultVault;

  if (!name) {
    throw new Error(
      'No vault specified and no default vault configured. ' +
        `Please add a vault to ${CONFIG_FILE}`
    );
  }

  const vaultPath = config.vaults[name];
  if (!vaultPath) {
    throw new Error(
      `Vault "${name}" not found in config. Available vaults: ${Object.keys(config.vaults).join(', ')}`
    );
  }

  return vaultPath;
}
