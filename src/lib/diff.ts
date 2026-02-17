export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'unchanged', content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', content: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'removed', content: a[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

export interface DiffChunk {
  id: string;
  type: 'unchanged' | 'modification';
  beforeLines: string[];
  afterLines: string[];
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Compute a chunked diff that groups consecutive changes into modification chunks.
 * Unchanged regions are preserved as-is. Adjacent removed+added lines are combined
 * into a single 'modification' chunk for paired review.
 */
export function computeChunkedDiff(before: string, after: string): DiffChunk[] {
  const diff = computeLineDiff(before, after);
  const chunks: DiffChunk[] = [];
  let chunkId = 0;

  let i = 0;
  while (i < diff.length) {
    const line = diff[i];

    if (line.type === 'unchanged') {
      // Collect consecutive unchanged lines
      const beforeLines: string[] = [];
      const afterLines: string[] = [];
      while (i < diff.length && diff[i].type === 'unchanged') {
        beforeLines.push(diff[i].content);
        afterLines.push(diff[i].content);
        i++;
      }
      chunks.push({
        id: `chunk-${chunkId++}`,
        type: 'unchanged',
        beforeLines,
        afterLines,
        status: 'approved', // unchanged chunks are auto-approved
      });
    } else {
      // Collect consecutive changed lines (removed + added) into a modification
      const beforeLines: string[] = [];
      const afterLines: string[] = [];
      while (i < diff.length && diff[i].type !== 'unchanged') {
        if (diff[i].type === 'removed') {
          beforeLines.push(diff[i].content);
        } else {
          afterLines.push(diff[i].content);
        }
        i++;
      }
      chunks.push({
        id: `chunk-${chunkId++}`,
        type: 'modification',
        beforeLines,
        afterLines,
        status: 'pending',
      });
    }
  }

  return chunks;
}

/**
 * Given a list of chunks (some approved, some rejected), build the final markdown.
 * Approved modifications use afterLines. Rejected modifications use beforeLines.
 * Pending modifications are treated as rejected (keep original).
 */
export function finalizeChunks(chunks: DiffChunk[]): string {
  const lines: string[] = [];
  for (const chunk of chunks) {
    if (chunk.type === 'unchanged') {
      lines.push(...chunk.beforeLines);
    } else if (chunk.status === 'approved') {
      lines.push(...chunk.afterLines);
    } else {
      // rejected or pending — keep original
      lines.push(...chunk.beforeLines);
    }
  }
  return lines.join('\n');
}
