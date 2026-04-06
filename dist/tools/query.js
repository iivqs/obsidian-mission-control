"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.readCanvas = readCanvas;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const reader_1 = require("../vault/reader");
const multi_1 = require("../vault/multi");
function parseDQL(dql) {
    const typeMatch = dql.match(/^(LIST|TABLE)\s+/i);
    const type = (typeMatch?.[1]?.toUpperCase() ?? 'LIST');
    const fromMatch = dql.match(/FROM\s+"([^"]+)"/i);
    const from = fromMatch?.[1] ?? '';
    const columnsMatch = dql.match(/^TABLE\s+([^F]+)\s+FROM/i);
    const columns = columnsMatch
        ? columnsMatch[1].split(',').map((c) => c.trim())
        : ['name'];
    const whereMatch = dql.match(/WHERE\s+(\w+)\s*(=|>=|<=|>|<)\s*"([^"]+)"/i);
    const where = whereMatch
        ? { key: whereMatch[1], op: whereMatch[2], value: whereMatch[3] }
        : undefined;
    return { type, from, columns, where };
}
// ---------------------------------------------------------------------------
// WHERE filter
// ---------------------------------------------------------------------------
function applyWhere(frontmatter, where) {
    const raw = frontmatter[where.key];
    if (raw === undefined || raw === null)
        return false;
    // Normalise to string for comparison
    const actual = String(raw).toLowerCase();
    const expected = where.value.toLowerCase();
    switch (where.op) {
        case '=':
            return actual === expected;
        case '>=':
            return actual >= expected;
        case '<=':
            return actual <= expected;
        case '>':
            return actual > expected;
        case '<':
            return actual < expected;
        default:
            return false;
    }
}
// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
function formatQueryResult(result) {
    if (result.rows.length === 0) {
        return `(no results) columns: ${result.columns.join(', ')}`;
    }
    // Build a simple markdown table
    const header = `| ${result.columns.join(' | ')} |`;
    const separator = `| ${result.columns.map(() => '---').join(' | ')} |`;
    const rows = result.rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
    return [header, separator, rows].join('\n');
}
// ---------------------------------------------------------------------------
// obsidian_query
// ---------------------------------------------------------------------------
/**
 * obsidian_query — Run a Dataview DQL query against the vault.
 * Supports LIST and TABLE queries with FROM and WHERE clauses.
 */
async function query(input) {
    const dql = input.dql;
    const vaultName = input.vault;
    if (!dql || typeof dql !== 'string') {
        return {
            content: [{ type: 'text', text: 'Error: "dql" parameter is required and must be a string.' }],
        };
    }
    let parsed;
    try {
        parsed = parseDQL(dql);
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error parsing DQL: ${err.message}` }],
        };
    }
    if (!parsed.from) {
        return {
            content: [{ type: 'text', text: 'Error: DQL query must include a FROM "FolderName" clause.' }],
        };
    }
    // Resolve vault root
    let vaultRoot;
    try {
        const manager = await (0, multi_1.getVaultManager)();
        const vaultConfig = manager.getVaultConfig(vaultName);
        vaultRoot = vaultConfig.path;
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error resolving vault: ${err.message}` }],
        };
    }
    const folderPath = path_1.default.join(vaultRoot, parsed.from);
    // Read all markdown files in the folder
    let files;
    try {
        files = await (0, reader_1.readMarkdownFolder)(folderPath);
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error reading folder "${parsed.from}": ${err.message}` }],
        };
    }
    // Apply WHERE filter
    const filtered = parsed.where
        ? files.filter((f) => applyWhere(f.frontmatter, parsed.where))
        : files;
    // Build QueryResult
    let result;
    if (parsed.type === 'TABLE') {
        const columns = parsed.columns;
        const rows = filtered.map((f) => {
            return columns.map((col) => {
                if (col === 'name' || col === 'file.name') {
                    return path_1.default.basename(f.filePath, '.md');
                }
                const val = f.frontmatter[col];
                return val !== undefined && val !== null ? String(val) : '';
            });
        });
        result = { columns, rows };
    }
    else {
        // LIST — return file names
        const rows = filtered.map((f) => [path_1.default.basename(f.filePath, '.md')]);
        result = { columns: ['name'], rows };
    }
    const text = formatQueryResult(result);
    return {
        content: [{ type: 'text', text }],
    };
}
// ---------------------------------------------------------------------------
// Canvas file resolver
// ---------------------------------------------------------------------------
/**
 * Attempt to resolve a canvas file path within the vault.
 * Tries: exact path, with .canvas extension, and a recursive search.
 */
async function resolveCanvasPath(vaultRoot, file) {
    const candidates = [
        path_1.default.join(vaultRoot, file),
        path_1.default.join(vaultRoot, `${file}.canvas`),
        path_1.default.join(vaultRoot, file.endsWith('.canvas') ? file : `${file}.canvas`),
    ];
    for (const candidate of candidates) {
        try {
            await promises_1.default.access(candidate);
            return candidate;
        }
        catch {
            // Not found at this path — try next
        }
    }
    // Last resort: recursive search in vault root
    const { glob } = await Promise.resolve().then(() => __importStar(require('glob')));
    const baseName = path_1.default.basename(file.endsWith('.canvas') ? file : `${file}.canvas`);
    const matches = await glob(`**/${baseName}`, {
        cwd: vaultRoot,
        absolute: true,
        nodir: true,
    });
    if (matches.length > 0) {
        return matches[0];
    }
    throw new Error(`Canvas file not found: "${file}" in vault at "${vaultRoot}"`);
}
// ---------------------------------------------------------------------------
// Format canvas result
// ---------------------------------------------------------------------------
function formatCanvasResult(result) {
    const lines = [];
    lines.push(`Nodes (${result.nodes.length}):`);
    for (const node of result.nodes) {
        lines.push(`  [${node.type}] ${node.label} (id: ${node.id}, x: ${node.x}, y: ${node.y})`);
    }
    lines.push('');
    lines.push(`Edges (${result.edges.length}):`);
    for (const edge of result.edges) {
        const label = edge.label ? ` — "${edge.label}"` : '';
        lines.push(`  ${edge.from} → ${edge.to}${label}`);
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// obsidian_read_canvas
// ---------------------------------------------------------------------------
/**
 * obsidian_read_canvas — Read an Obsidian canvas file.
 * Returns nodes and edges from the .canvas JSON format.
 */
async function readCanvas(input) {
    const file = input.file;
    const vaultName = input.vault;
    if (!file || typeof file !== 'string') {
        return {
            content: [{ type: 'text', text: 'Error: "file" parameter is required and must be a string.' }],
        };
    }
    // Resolve vault root
    let vaultRoot;
    try {
        const manager = await (0, multi_1.getVaultManager)();
        const vaultConfig = manager.getVaultConfig(vaultName);
        vaultRoot = vaultConfig.path;
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error resolving vault: ${err.message}` }],
        };
    }
    // Find the canvas file
    let canvasPath;
    try {
        canvasPath = await resolveCanvasPath(vaultRoot, file);
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: err.message }],
        };
    }
    // Read and parse the JSON
    let raw;
    try {
        raw = await promises_1.default.readFile(canvasPath, 'utf-8');
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error reading canvas file "${canvasPath}": ${err.message}` }],
        };
    }
    let canvas;
    try {
        canvas = JSON.parse(raw);
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error parsing canvas JSON: ${err.message}` }],
        };
    }
    // Map to CanvasResult
    const nodes = (canvas.nodes ?? []).map((n) => ({
        id: n.id,
        label: n.text ?? n.file ?? n.id,
        type: n.type,
        x: n.x,
        y: n.y,
    }));
    const edges = (canvas.edges ?? []).map((e) => ({
        from: e.fromNode,
        to: e.toNode,
        label: e.label,
    }));
    const result = { nodes, edges };
    const text = formatCanvasResult(result);
    return {
        content: [{ type: 'text', text }],
    };
}
