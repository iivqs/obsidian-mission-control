import path from 'path';
import fs from 'fs/promises';
import { QueryResult, CanvasResult, CanvasNode, CanvasEdge } from '../types';
import { readMarkdownFolder } from '../vault/reader';
import { getVaultManager } from '../vault/multi';

type ToolResult = { content: Array<{ type: string; text: string }> };

// ---------------------------------------------------------------------------
// DQL parser types and implementation
// ---------------------------------------------------------------------------

interface ParsedDQL {
  type: 'LIST' | 'TABLE';
  from: string;
  columns: string[];
  where?: { key: string; op: string; value: string };
}

function parseDQL(dql: string): ParsedDQL {
  const typeMatch = dql.match(/^(LIST|TABLE)\s+/i);
  const type = (typeMatch?.[1]?.toUpperCase() ?? 'LIST') as 'LIST' | 'TABLE';

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

function applyWhere(
  frontmatter: Record<string, unknown>,
  where: { key: string; op: string; value: string }
): boolean {
  const raw = frontmatter[where.key];
  if (raw === undefined || raw === null) return false;

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

function formatQueryResult(result: QueryResult): string {
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
export async function query(input: Record<string, unknown>): Promise<ToolResult> {
  const dql = input.dql as string | undefined;
  const vaultName = input.vault as string | undefined;

  if (!dql || typeof dql !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: "dql" parameter is required and must be a string.' }],
    };
  }

  let parsed: ParsedDQL;
  try {
    parsed = parseDQL(dql);
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error parsing DQL: ${(err as Error).message}` }],
    };
  }

  if (!parsed.from) {
    return {
      content: [{ type: 'text', text: 'Error: DQL query must include a FROM "FolderName" clause.' }],
    };
  }

  // Resolve vault root
  let vaultRoot: string;
  try {
    const manager = await getVaultManager();
    const vaultConfig = manager.getVaultConfig(vaultName);
    vaultRoot = vaultConfig.path;
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error resolving vault: ${(err as Error).message}` }],
    };
  }

  const folderPath = path.join(vaultRoot, parsed.from);

  // Read all markdown files in the folder
  let files: Array<{ filePath: string; frontmatter: Record<string, unknown>; body: string }>;
  try {
    files = await readMarkdownFolder(folderPath);
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error reading folder "${parsed.from}": ${(err as Error).message}` }],
    };
  }

  // Apply WHERE filter
  const filtered = parsed.where
    ? files.filter((f) => applyWhere(f.frontmatter, parsed.where!))
    : files;

  // Build QueryResult
  let result: QueryResult;

  if (parsed.type === 'TABLE') {
    const columns = parsed.columns;
    const rows = filtered.map((f) => {
      return columns.map((col) => {
        if (col === 'name' || col === 'file.name') {
          return path.basename(f.filePath, '.md');
        }
        const val = f.frontmatter[col];
        return val !== undefined && val !== null ? String(val) : '';
      });
    });
    result = { columns, rows };
  } else {
    // LIST — return file names
    const rows = filtered.map((f) => [path.basename(f.filePath, '.md')]);
    result = { columns: ['name'], rows };
  }

  const text = formatQueryResult(result);

  return {
    content: [{ type: 'text', text }],
  };
}

// ---------------------------------------------------------------------------
// Canvas types (raw JSON shape)
// ---------------------------------------------------------------------------

interface RawCanvasNode {
  id: string;
  type: string;
  text?: string;
  file?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

interface RawCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
  [key: string]: unknown;
}

interface RawCanvas {
  nodes?: RawCanvasNode[];
  edges?: RawCanvasEdge[];
}

// ---------------------------------------------------------------------------
// Canvas file resolver
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve a canvas file path within the vault.
 * Tries: exact path, with .canvas extension, and a recursive search.
 */
async function resolveCanvasPath(vaultRoot: string, file: string): Promise<string> {
  const candidates: string[] = [
    path.join(vaultRoot, file),
    path.join(vaultRoot, `${file}.canvas`),
    path.join(vaultRoot, file.endsWith('.canvas') ? file : `${file}.canvas`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Not found at this path — try next
    }
  }

  // Last resort: recursive search in vault root
  const { glob } = await import('glob');
  const baseName = path.basename(file.endsWith('.canvas') ? file : `${file}.canvas`);
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

function formatCanvasResult(result: CanvasResult): string {
  const lines: string[] = [];

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
export async function readCanvas(input: Record<string, unknown>): Promise<ToolResult> {
  const file = input.file as string | undefined;
  const vaultName = input.vault as string | undefined;

  if (!file || typeof file !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: "file" parameter is required and must be a string.' }],
    };
  }

  // Resolve vault root
  let vaultRoot: string;
  try {
    const manager = await getVaultManager();
    const vaultConfig = manager.getVaultConfig(vaultName);
    vaultRoot = vaultConfig.path;
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error resolving vault: ${(err as Error).message}` }],
    };
  }

  // Find the canvas file
  let canvasPath: string;
  try {
    canvasPath = await resolveCanvasPath(vaultRoot, file);
  } catch (err) {
    return {
      content: [{ type: 'text', text: (err as Error).message }],
    };
  }

  // Read and parse the JSON
  let raw: string;
  try {
    raw = await fs.readFile(canvasPath, 'utf-8');
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error reading canvas file "${canvasPath}": ${(err as Error).message}` }],
    };
  }

  let canvas: RawCanvas;
  try {
    canvas = JSON.parse(raw) as RawCanvas;
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error parsing canvas JSON: ${(err as Error).message}` }],
    };
  }

  // Map to CanvasResult
  const nodes: CanvasNode[] = (canvas.nodes ?? []).map((n) => ({
    id: n.id,
    label: n.text ?? n.file ?? n.id,
    type: n.type,
    x: n.x,
    y: n.y,
  }));

  const edges: CanvasEdge[] = (canvas.edges ?? []).map((e) => ({
    from: e.fromNode,
    to: e.toNode,
    label: e.label,
  }));

  const result: CanvasResult = { nodes, edges };
  const text = formatCanvasResult(result);

  return {
    content: [{ type: 'text', text }],
  };
}
