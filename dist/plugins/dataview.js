"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDQL = parseDQL;
exports.executeDQL = executeDQL;
exports.runDQL = runDQL;
const path_1 = __importDefault(require("path"));
const reader_1 = require("../vault/reader");
/**
 * Parse a DQL query string into a structured object.
 *
 * Supported syntax:
 *   LIST FROM "Folder"
 *   TABLE col1, col2 FROM "Folder"
 *   WHERE key = "value" | key >= "date" | key <= n | ...
 *   SORT key ASC | DESC
 *   LIMIT n
 */
function parseDQL(dql) {
    // Normalise whitespace and work with uppercase keywords
    const normalised = dql.replace(/\s+/g, ' ').trim();
    // --- TYPE + COLUMNS -------------------------------------------------
    let type = 'LIST';
    let columns = [];
    let remainder = normalised;
    if (/^TABLE\b/i.test(remainder)) {
        type = 'TABLE';
        remainder = remainder.replace(/^TABLE\s*/i, '');
        // Grab everything up to FROM
        const fromIdx = remainder.search(/\bFROM\b/i);
        if (fromIdx > 0) {
            const colPart = remainder.slice(0, fromIdx).trim();
            columns = colPart.split(',').map((c) => c.trim()).filter(Boolean);
            remainder = remainder.slice(fromIdx);
        }
    }
    else {
        // LIST
        remainder = remainder.replace(/^LIST\s*/i, '');
    }
    // --- FROM -----------------------------------------------------------
    let from = '';
    const fromMatch = /\bFROM\s+"([^"]+)"/i.exec(remainder);
    if (fromMatch) {
        from = fromMatch[1];
        remainder = remainder.slice(fromMatch.index + fromMatch[0].length).trim();
    }
    // --- WHERE ----------------------------------------------------------
    let where;
    const whereMatch = /\bWHERE\s+(\w+)\s*(>=|<=|!=|>|<|=)\s*"?([^"]+?)"?\s*(?=SORT|LIMIT|$)/i.exec(remainder);
    if (whereMatch) {
        where = {
            key: whereMatch[1],
            op: whereMatch[2],
            value: whereMatch[3].trim(),
        };
        remainder = remainder.slice(whereMatch.index + whereMatch[0].length).trim();
    }
    // --- SORT -----------------------------------------------------------
    let sortBy;
    const sortMatch = /\bSORT\s+(\w+)\s*(ASC|DESC)?/i.exec(remainder);
    if (sortMatch) {
        sortBy = {
            key: sortMatch[1],
            direction: (sortMatch[2] ?? 'asc').toLowerCase(),
        };
        remainder = remainder.slice(sortMatch.index + sortMatch[0].length).trim();
    }
    // --- LIMIT ----------------------------------------------------------
    let limit;
    const limitMatch = /\bLIMIT\s+(\d+)/i.exec(remainder);
    if (limitMatch) {
        limit = parseInt(limitMatch[1], 10);
    }
    const result = { type, from, columns };
    if (where)
        result.where = where;
    if (sortBy)
        result.sortBy = sortBy;
    if (limit !== undefined)
        result.limit = limit;
    return result;
}
// ---------------------------------------------------------------------------
// Helper: compare two string values with the given operator.
// Tries numeric comparison first, then lexicographic.
// ---------------------------------------------------------------------------
function applyOp(actual, op, expected) {
    const numActual = Number(actual);
    const numExpected = Number(expected);
    const numeric = !isNaN(numActual) && !isNaN(numExpected);
    if (numeric) {
        if (op === '=')
            return numActual === numExpected;
        if (op === '!=')
            return numActual !== numExpected;
        if (op === '>')
            return numActual > numExpected;
        if (op === '>=')
            return numActual >= numExpected;
        if (op === '<')
            return numActual < numExpected;
        if (op === '<=')
            return numActual <= numExpected;
    }
    // Lexicographic (works for YYYY-MM-DD dates too)
    const a = actual.toLowerCase();
    const e = expected.toLowerCase();
    if (op === '=')
        return a === e;
    if (op === '!=')
        return a !== e;
    if (op === '>')
        return a > e;
    if (op === '>=')
        return a >= e;
    if (op === '<')
        return a < e;
    if (op === '<=')
        return a <= e;
    return false;
}
/**
 * Execute a parsed DQL query against a vault root.
 * Reads frontmatter from markdown files in the FROM folder.
 */
async function executeDQL(query, vaultRoot) {
    const folderPath = path_1.default.join(vaultRoot, query.from);
    let files;
    try {
        files = await (0, reader_1.readMarkdownFolder)(folderPath);
    }
    catch {
        return { columns: [], rows: [] };
    }
    // --- Apply WHERE ----------------------------------------------------
    let filtered = files;
    if (query.where) {
        const { key, op, value } = query.where;
        filtered = files.filter(({ filePath, frontmatter }) => {
            const rawVal = frontmatter[key];
            const actual = rawVal !== undefined && rawVal !== null
                ? String(rawVal)
                : key === 'name'
                    ? path_1.default.basename(filePath, '.md')
                    : '';
            return applyOp(actual, op, value);
        });
    }
    // --- Build rows -----------------------------------------------------
    let columns;
    let rows;
    if (query.type === 'LIST') {
        columns = ['name'];
        rows = filtered.map(({ filePath }) => [path_1.default.basename(filePath, '.md')]);
    }
    else {
        // TABLE — use explicit columns, defaulting "name" to filename
        columns = query.columns.length > 0 ? query.columns : ['name'];
        rows = filtered.map(({ filePath, frontmatter }) => {
            return columns.map((col) => {
                if (col === 'name' && frontmatter[col] === undefined) {
                    return path_1.default.basename(filePath, '.md');
                }
                const val = frontmatter[col];
                return val !== undefined && val !== null ? String(val) : '';
            });
        });
    }
    // --- Apply SORT -----------------------------------------------------
    if (query.sortBy) {
        const { key, direction } = query.sortBy;
        const colIdx = columns.indexOf(key);
        if (colIdx !== -1) {
            rows.sort((a, b) => {
                const av = a[colIdx];
                const bv = b[colIdx];
                const numA = Number(av);
                const numB = Number(bv);
                const numeric = !isNaN(numA) && !isNaN(numB);
                let cmp;
                if (numeric) {
                    cmp = numA - numB;
                }
                else {
                    cmp = av.toLowerCase().localeCompare(bv.toLowerCase());
                }
                return direction === 'desc' ? -cmp : cmp;
            });
        }
    }
    // --- Apply LIMIT ----------------------------------------------------
    if (query.limit !== undefined) {
        rows = rows.slice(0, query.limit);
    }
    return { columns, rows };
}
/**
 * Convenience wrapper: parse a DQL string and execute it.
 */
async function runDQL(dql, vaultRoot) {
    const query = parseDQL(dql);
    return executeDQL(query, vaultRoot);
}
