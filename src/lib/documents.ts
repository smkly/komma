import { getDb } from './db';
import type { Document } from './types';

export function getOrCreateDocument(filePath: string, title?: string): Document {
  const db = getDb();

  // Skip warmup/invalid paths — don't pollute the documents table
  if (!filePath.startsWith('/')) {
    return { id: 0, file_path: filePath, title: null, last_opened_at: '', created_at: '', updated_at: '' } as Document;
  }

  const existing = db.prepare('SELECT * FROM documents WHERE file_path = ?').get(filePath) as Document | undefined;

  if (existing) {
    db.prepare('UPDATE documents SET last_opened_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(existing.id);
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(existing.id) as Document;
  }

  const result = db.prepare(
    'INSERT INTO documents (file_path, title, last_opened_at) VALUES (?, ?, datetime(\'now\'))'
  ).run(filePath, title || null);

  return db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid) as Document;
}

export interface ParsedFrontmatter {
  title?: string;
  type?: string;
  status?: string;
  created?: string;
  shared?: boolean;
  shared_with?: string[];
  related?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): { frontmatter: ParsedFrontmatter | null; rawFrontmatter: string | null; content: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, rawFrontmatter: null, content };
  }

  const yamlBlock = match[1];
  const body = match[2];

  // Simple YAML parser that handles key: value pairs and arrays
  const frontmatter: ParsedFrontmatter = {};
  const lines = yamlBlock.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Check for array item (  - "value" or  - value)
    const arrayMatch = line.match(/^\s+-\s+(.*)$/);
    if (arrayMatch && currentKey) {
      let item = arrayMatch[1].trim();
      // Remove surrounding quotes
      if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
        item = item.slice(1, -1);
      }
      if (!currentArray) {
        currentArray = [];
      }
      currentArray.push(item);
      frontmatter[currentKey] = currentArray;
      continue;
    }

    // Check for key: value pair
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      // Save previous array if any
      currentKey = kvMatch[1];
      currentArray = null;
      const rawValue = kvMatch[2].trim();

      if (rawValue === '') {
        // Key with no inline value — next lines may be array items
        continue;
      }

      let value: unknown = rawValue;
      // Remove surrounding quotes
      if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        value = (value as string).slice(1, -1);
      }
      // Parse booleans
      if (value === 'true') value = true;
      else if (value === 'false') value = false;

      frontmatter[currentKey] = value;
    }
  }

  // Extract wiki-link references from related array
  if (Array.isArray(frontmatter.related)) {
    frontmatter.related = frontmatter.related.map((ref: string) => {
      const wikiMatch = ref.match(/\[\[([^\]]+)\]\]/);
      return wikiMatch ? wikiMatch[1] : ref;
    });
  }

  return { frontmatter, rawFrontmatter: `---\n${yamlBlock}\n---\n`, content: body };
}
