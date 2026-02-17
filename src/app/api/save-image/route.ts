import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { dataUri, docPath } = await request.json();
    if (!dataUri || !docPath) {
      return NextResponse.json({ error: 'Missing dataUri or docPath' }, { status: 400 });
    }

    // Parse data URI: data:image/png;base64,ABC123...
    const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid data URI' }, { status: 400 });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];

    // Generate a short hash-based filename
    const hash = crypto.createHash('md5').update(base64Data.slice(0, 1000)).digest('hex').slice(0, 8);
    const filename = `img-${hash}.${ext}`;

    // Save in same directory as the .md file
    const docDir = path.dirname(docPath);
    const assetsDir = path.join(docDir, 'assets');
    await mkdir(assetsDir, { recursive: true });

    const imagePath = path.join(assetsDir, filename);
    await writeFile(imagePath, Buffer.from(base64Data, 'base64'));

    return NextResponse.json({ path: imagePath, relative: `assets/${filename}` });
  } catch (error) {
    console.error('Failed to save image:', error);
    return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
  }
}
