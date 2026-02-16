import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const PENDING_FILE = '/tmp/helm-open-file';

export async function GET() {
  // Priority 1: file opened from Finder (written by Helm.app wrapper)
  try {
    if (existsSync(PENDING_FILE)) {
      const filePath = readFileSync(PENDING_FILE, 'utf-8').trim();
      unlinkSync(PENDING_FILE);
      if (filePath) {
        return NextResponse.json({ filePath });
      }
    }
  } catch { /* ignore */ }

  // Priority 2: last opened document from SQLite
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT file_path FROM documents ORDER BY last_opened_at DESC LIMIT 1'
    ).get() as { file_path: string } | undefined;

    return NextResponse.json({ filePath: row?.file_path || null });
  } catch (error) {
    console.error('Failed to get last document:', error);
    return NextResponse.json({ filePath: null });
  }
}
