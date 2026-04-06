import { QueryResult } from '../types';
import path from 'path';
import { readMarkdownFolder } from '../vault/reader';

export interface ParsedDQL {
  type: 'LIST' | 'TABLE';
  from: string;
  columns: string[];
  where?: { key: string; op: '=' | '>=' | '<=' | '>' | '<' | '!='; value: string };
  sortBy?: { key: string; direction: 'asc' | 'desc' };
  limit?: number;
}

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
export function parseDQL(dql: string): ParsedDQL {
  // Normalise whitespace and work with uppercase keywords
  const normalised = dql.replace(/\s+/g, ' ').trim();

  // --- TYPE + COLUMNS -------------------------------------------------
  let type: 'LIST' | 'TABLE' = 'LIST';
  let columns: string[] = [];
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
  } else {
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
  let where: ParsedDQL['where'];
  const whereMatch = /\bWHERE\s+(\w+)\s*(>=|<=|!=|>|<|=)\s*"?([^"]+?)"?\s*(?=SORT|LIMIT|$)/i.exec(remainder);
  if (whereMatch) {
    where = {
      key: whereMatch[1],
      op: whereMatch[2] as '=' | '>=' | '<=' | '>' | '<' | '!=',
      value: whereMatch[3].trim(),
    };
    remainder = remainder.slice(whereMatch.index + whereMatch[0].length).trim();
  }

  // --- SORT -----------------------------------------------------------
  let sortBy: ParsedDQL['sortBy'];
  const sortMatch = /\bSORT\s+(\w+)\s*(ASC|DESC)?/i.exec(remainder);
  if (sortMatch) {
    sortBy = {
      key: sortMatch[1],
      direction: (sortMatch[2] ?? 'asc').toLowerCase() as 'asc' | 'desc',
    };
    remainder = remainder.slice(sortMatch.index + sortMatch[0].length).trim();
  }

  // --- LIMIT ----------------------------------------------------------
  let limit: number | undefined;
  const limitMatch = /\bLIMIT\s+(\d+)/i.exec(remainder);
  if (limitMatch) {
    limit = parseInt(limitMatch[1], 10);
  }

  const result: ParsedDQL = { type, from, columns };
  if (where) result.where = where;
  if (sortBy) result.sortBy = sortBy;
  if (limit !== undefined) result.limit = limit;

  return result;
}

// ---------------------------------------------------------------------------
// Helper: compare two string values with the given operator.
// Tries numeric comparison first, then lexicographic.
// ---------------------------------------------------------------------------
function applyOp(actual: string, op: string, expected: string): boolean {
  const numActual = Number(actual);
  const numExpected = Number(expected);
  const numeric = !isNaN(numActual) && !isNaN(numExpected);

  if (numeric) {
    if (op === '=') return numActual === numExpected;
    if (op === '!=') return numActual !== numExpected;
    if (op === '>') return numActual > numExpected;
    if (op === '>=') return numActual >= numExpected;
    if (op === '<') return numActual < numExpected;
    if (op === '<=') return numActual <= numExpected;
  }

  // Lexicographic (works for YYYY-MM-DD dates too)
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  if (op === '=') return a === e;
  if (op === '!=') return a !== e;
  if (op === '>') return a > e;
  if (op === '>=') return a >= e;
  if (op === '<') return a < e;
  if (op === '<=') return a <= e;
  return false;
}

/**
 * Execute a parsed DQL query against a vault root.
 * Reads frontmatter from markdown files in the FROM folder.
 */
export async function executeDQL(query: ParsedDQL, vaultRoot: string): Promise<QueryResult> {
  const folderPath = path.join(vaultRoot, query.from);

  let files: Array<{ filePath: string; frontmatter: Record<string, unknown>; body: string }>;
  try {
    files = await readMarkdownFolder(folderPath);
  } catch {
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
          ? path.basename(filePath, '.md')
          : '';
      return applyOp(actual, op, value);
    });
  }

  // --- Build rows -----------------------------------------------------
  let columns: string[];
  let rows: string[][];

  if (query.type === 'LIST') {
    columns = ['name'];
    rows = filtered.map(({ filePath }) => [path.basename(filePath, '.md')]);
  } else {
    // TABLE — use explicit columns, defaulting "name" to filename
    columns = query.columns.length > 0 ? query.columns : ['name'];
    rows = filtered.map(({ filePath, frontmatter }) => {
      return columns.map((col) => {
        if (col === 'name' && frontmatter[col] === undefined) {
          return path.basename(filePath, '.md');
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
        let cmp: number;
        if (numeric) {
          cmp = numA - numB;
        } else {
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
export async function runDQL(dql: string, vaultRoot: string): Promise<QueryResult> {
  const query = parseDQL(dql);
  return executeDQL(query, vaultRoot);
}
