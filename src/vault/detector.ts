import { VaultStructure } from '../types';
import path from 'path';
import fs from 'fs/promises';

/**
 * Check if a directory entry exists and is a directory.
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the first matching folder variant that exists under vaultRoot,
 * returning just the folder name (not the full path).
 * Returns the fallback name if none found.
 */
async function resolveFolder(vaultRoot: string, variants: string[], fallback: string): Promise<string> {
  for (const variant of variants) {
    if (await dirExists(path.join(vaultRoot, variant))) {
      return variant;
    }
  }
  return fallback;
}

/**
 * Resolve an optional folder — returns undefined if none of the variants exist.
 */
async function resolveOptionalFolder(vaultRoot: string, variants: string[]): Promise<string | undefined> {
  for (const variant of variants) {
    if (await dirExists(path.join(vaultRoot, variant))) {
      return variant;
    }
  }
  return undefined;
}

/**
 * Auto-detect the folder structure of an Obsidian vault.
 * Looks for common folder name variants and returns a VaultStructure.
 */
export async function detectVaultStructure(vaultRoot: string): Promise<VaultStructure> {
  const [projectsFolder, sessionsFolder, tasksFolder, templatesFolder] = await Promise.all([
    resolveFolder(vaultRoot, ['Projects', 'projects', 'Work', 'Notes'], 'Projects'),
    resolveFolder(vaultRoot, ['Sessions', 'sessions', 'Journal', 'Logs', 'Daily Notes'], 'Sessions'),
    resolveOptionalFolder(vaultRoot, ['Tasks', 'tasks']),
    resolveOptionalFolder(vaultRoot, ['_templates', 'Templates', 'templates']),
  ]);

  return {
    root: vaultRoot,
    projectsFolder,
    sessionsFolder,
    tasksFolder,
    templatesFolder,
  };
}

/**
 * Check if a path looks like an Obsidian vault.
 * True if it contains a .obsidian directory OR any .md files at the root level.
 */
export async function isObsidianVault(dirPath: string): Promise<boolean> {
  // Check for .obsidian directory
  if (await dirExists(path.join(dirPath, '.obsidian'))) {
    return true;
  }

  // Check for any .md files in the root
  try {
    const entries = await fs.readdir(dirPath);
    return entries.some((entry) => entry.endsWith('.md'));
  } catch {
    return false;
  }
}
