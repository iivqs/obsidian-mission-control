"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.getVaultPath = getVaultPath;
const os_1 = __importDefault(require("os"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const CONFIG_FILE = path_1.default.join(os_1.default.homedir(), '.obsidian-mc.json');
const DEFAULT_CONFIG = {
    vaults: {},
    defaultVault: '',
    plugins: {
        tasks: true,
        dataview: false,
        templater: false,
    },
};
async function loadConfig() {
    try {
        const raw = await promises_1.default.readFile(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const config = {
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
                config.vaults[name] = path_1.default.join(os_1.default.homedir(), vaultPath.slice(2));
            }
            else {
                config.vaults[name] = path_1.default.resolve(vaultPath);
            }
        }
        // Set defaultVault to first vault if not specified
        if (!config.defaultVault && Object.keys(config.vaults).length > 0) {
            config.defaultVault = Object.keys(config.vaults)[0];
        }
        return config;
    }
    catch (err) {
        // If file doesn't exist, return defaults
        if (typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            err.code === 'ENOENT') {
            return { ...DEFAULT_CONFIG };
        }
        throw err;
    }
}
function getVaultPath(config, vaultName) {
    const name = vaultName ?? config.defaultVault;
    if (!name) {
        throw new Error('No vault specified and no default vault configured. ' +
            `Please add a vault to ${CONFIG_FILE}`);
    }
    const vaultPath = config.vaults[name];
    if (!vaultPath) {
        throw new Error(`Vault "${name}" not found in config. Available vaults: ${Object.keys(config.vaults).join(', ')}`);
    }
    return vaultPath;
}
