"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectVaultStructure = detectVaultStructure;
exports.isObsidianVault = isObsidianVault;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
/**
 * Check if a directory entry exists and is a directory.
 */
async function dirExists(dirPath) {
    try {
        const stat = await promises_1.default.stat(dirPath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Resolve the first matching folder variant that exists under vaultRoot,
 * returning just the folder name (not the full path).
 * Returns the fallback name if none found.
 */
async function resolveFolder(vaultRoot, variants, fallback) {
    for (const variant of variants) {
        if (await dirExists(path_1.default.join(vaultRoot, variant))) {
            return variant;
        }
    }
    return fallback;
}
/**
 * Resolve an optional folder — returns undefined if none of the variants exist.
 */
async function resolveOptionalFolder(vaultRoot, variants) {
    for (const variant of variants) {
        if (await dirExists(path_1.default.join(vaultRoot, variant))) {
            return variant;
        }
    }
    return undefined;
}
/**
 * Auto-detect the folder structure of an Obsidian vault.
 * Looks for common folder name variants and returns a VaultStructure.
 */
async function detectVaultStructure(vaultRoot) {
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
async function isObsidianVault(dirPath) {
    // Check for .obsidian directory
    if (await dirExists(path_1.default.join(dirPath, '.obsidian'))) {
        return true;
    }
    // Check for any .md files in the root
    try {
        const entries = await promises_1.default.readdir(dirPath);
        return entries.some((entry) => entry.endsWith('.md'));
    }
    catch {
        return false;
    }
}
