import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { Config, VaultConfig, VaultStructure } from '../types';
import { loadConfig } from '../config';
import { detectVaultStructure, isObsidianVault } from './detector';

/**
 * Multi-vault manager. Resolves vault configs and caches structure detection.
 */
export class MultiVaultManager {
  private config: Config;
  private activeVaultName: string;
  private structureCache: Map<string, VaultStructure> = new Map();

  constructor(config: Config) {
    this.config = config;
    this.activeVaultName = config.defaultVault;
  }

  /**
   * Get all configured vault configs (name + resolved absolute path).
   */
  listVaults(): VaultConfig[] {
    return Object.entries(this.config.vaults).map(([name, vaultPath]) => ({
      name,
      path: this.resolvePath(vaultPath),
    }));
  }

  /**
   * Get VaultConfig for a named vault (or the active/default vault).
   */
  getVaultConfig(vaultName?: string): VaultConfig {
    const name = vaultName ?? this.activeVaultName;

    if (!name) {
      throw new Error(
        'No vault specified and no active vault set. ' +
          'Please configure a vault in ~/.obsidian-mc.json'
      );
    }

    const vaultPath = this.config.vaults[name];
    if (vaultPath === undefined) {
      const available = Object.keys(this.config.vaults).join(', ') || '(none)';
      throw new Error(
        `Vault "${name}" not found in config. Available vaults: ${available}`
      );
    }

    return {
      name,
      path: this.resolvePath(vaultPath),
    };
  }

  /**
   * Get (and cache) the VaultStructure for a named vault.
   */
  async getVaultStructure(vaultName?: string): Promise<VaultStructure> {
    const vaultConfig = this.getVaultConfig(vaultName);

    if (this.structureCache.has(vaultConfig.name)) {
      return this.structureCache.get(vaultConfig.name)!;
    }

    const structure = await detectVaultStructure(vaultConfig.path);
    this.structureCache.set(vaultConfig.name, structure);
    return structure;
  }

  /**
   * Switch the active vault by name.
   */
  setActiveVault(vaultName: string): void {
    if (this.config.vaults[vaultName] === undefined) {
      const available = Object.keys(this.config.vaults).join(', ') || '(none)';
      throw new Error(
        `Vault "${vaultName}" not found in config. Available vaults: ${available}`
      );
    }
    this.activeVaultName = vaultName;
  }

  /**
   * Get the currently active vault config.
   */
  getActiveVault(): VaultConfig {
    return this.getVaultConfig(this.activeVaultName);
  }

  /**
   * Reload config from disk (useful if user edits ~/.obsidian-mc.json).
   * Clears the structure cache and resets the active vault to the new default.
   */
  async reload(): Promise<void> {
    this.config = await loadConfig();
    this.activeVaultName = this.config.defaultVault;
    this.structureCache.clear();
  }

  /**
   * Validate all configured vaults exist and are valid Obsidian vaults.
   */
  async validate(): Promise<Array<{ name: string; valid: boolean; error?: string }>> {
    const results: Array<{ name: string; valid: boolean; error?: string }> = [];

    for (const [name, rawPath] of Object.entries(this.config.vaults)) {
      const resolvedPath = this.resolvePath(rawPath);

      try {
        // Check the path exists
        await fs.access(resolvedPath);

        // Check it's a valid Obsidian vault
        const valid = await isObsidianVault(resolvedPath);
        if (valid) {
          results.push({ name, valid: true });
        } else {
          results.push({
            name,
            valid: false,
            error: `Path exists but is not a valid Obsidian vault (missing .obsidian directory): ${resolvedPath}`,
          });
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        results.push({
          name,
          valid: false,
          error: `Cannot access vault path "${resolvedPath}": ${message}`,
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolvePath(vaultPath: string): string {
    if (vaultPath.startsWith('~/')) {
      return path.join(os.homedir(), vaultPath.slice(2));
    }
    return path.resolve(vaultPath);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _manager: MultiVaultManager | null = null;

export async function getVaultManager(): Promise<MultiVaultManager> {
  if (!_manager) {
    const config = await loadConfig();
    _manager = new MultiVaultManager(config);
  }
  return _manager;
}
