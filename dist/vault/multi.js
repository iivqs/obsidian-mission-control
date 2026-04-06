"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiVaultManager = void 0;
exports.getVaultManager = getVaultManager;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const promises_1 = __importDefault(require("fs/promises"));
const config_1 = require("../config");
const detector_1 = require("./detector");
/**
 * Multi-vault manager. Resolves vault configs and caches structure detection.
 */
class MultiVaultManager {
    constructor(config) {
        this.structureCache = new Map();
        this.config = config;
        this.activeVaultName = config.defaultVault;
    }
    /**
     * Get all configured vault configs (name + resolved absolute path).
     */
    listVaults() {
        return Object.entries(this.config.vaults).map(([name, vaultPath]) => ({
            name,
            path: this.resolvePath(vaultPath),
        }));
    }
    /**
     * Get VaultConfig for a named vault (or the active/default vault).
     */
    getVaultConfig(vaultName) {
        const name = vaultName ?? this.activeVaultName;
        if (!name) {
            throw new Error('No vault specified and no active vault set. ' +
                'Please configure a vault in ~/.obsidian-mc.json');
        }
        const vaultPath = this.config.vaults[name];
        if (vaultPath === undefined) {
            const available = Object.keys(this.config.vaults).join(', ') || '(none)';
            throw new Error(`Vault "${name}" not found in config. Available vaults: ${available}`);
        }
        return {
            name,
            path: this.resolvePath(vaultPath),
        };
    }
    /**
     * Get (and cache) the VaultStructure for a named vault.
     */
    async getVaultStructure(vaultName) {
        const vaultConfig = this.getVaultConfig(vaultName);
        if (this.structureCache.has(vaultConfig.name)) {
            return this.structureCache.get(vaultConfig.name);
        }
        const structure = await (0, detector_1.detectVaultStructure)(vaultConfig.path);
        this.structureCache.set(vaultConfig.name, structure);
        return structure;
    }
    /**
     * Switch the active vault by name.
     */
    setActiveVault(vaultName) {
        if (this.config.vaults[vaultName] === undefined) {
            const available = Object.keys(this.config.vaults).join(', ') || '(none)';
            throw new Error(`Vault "${vaultName}" not found in config. Available vaults: ${available}`);
        }
        this.activeVaultName = vaultName;
    }
    /**
     * Get the currently active vault config.
     */
    getActiveVault() {
        return this.getVaultConfig(this.activeVaultName);
    }
    /**
     * Reload config from disk (useful if user edits ~/.obsidian-mc.json).
     * Clears the structure cache and resets the active vault to the new default.
     */
    async reload() {
        this.config = await (0, config_1.loadConfig)();
        this.activeVaultName = this.config.defaultVault;
        this.structureCache.clear();
    }
    /**
     * Validate all configured vaults exist and are valid Obsidian vaults.
     */
    async validate() {
        const results = [];
        for (const [name, rawPath] of Object.entries(this.config.vaults)) {
            const resolvedPath = this.resolvePath(rawPath);
            try {
                // Check the path exists
                await promises_1.default.access(resolvedPath);
                // Check it's a valid Obsidian vault
                const valid = await (0, detector_1.isObsidianVault)(resolvedPath);
                if (valid) {
                    results.push({ name, valid: true });
                }
                else {
                    results.push({
                        name,
                        valid: false,
                        error: `Path exists but is not a valid Obsidian vault (missing .obsidian directory): ${resolvedPath}`,
                    });
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
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
    resolvePath(vaultPath) {
        if (vaultPath.startsWith('~/')) {
            return path_1.default.join(os_1.default.homedir(), vaultPath.slice(2));
        }
        return path_1.default.resolve(vaultPath);
    }
}
exports.MultiVaultManager = MultiVaultManager;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _manager = null;
async function getVaultManager() {
    if (!_manager) {
        const config = await (0, config_1.loadConfig)();
        _manager = new MultiVaultManager(config);
    }
    return _manager;
}
