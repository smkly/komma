import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { getOrCreateDocument } from '@/lib/documents';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'No path provided' }, { status: 400 });
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    // Track this file as the most recently opened document
    try { getOrCreateDocument(filePath); } catch { /* DB not ready */ }
    return NextResponse.json({ content });
  } catch (error: unknown) {
    // Return empty content for new files that don't exist yet
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return NextResponse.json({ content: '' });
    }
    console.error('Failed to read file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { path, content } = await request.json();

    if (!path) {
      return NextResponse.json({ error: 'No path provided' }, { status: 400 });
    }

    if (content === undefined) {
      return NextResponse.json({ error: 'No content provided' }, { status: 400 });
    }

    await writeFile(path, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to write file:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
