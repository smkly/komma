'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_WIDTH = 100;

export default function ImageNodeView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { src, alt, width, align } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altText, setAltText] = useState(alt || '');
  const resizeStartRef = useRef<{ startX: number; startY: number; startW: number; corner: string } | null>(null);
  const aspectRef = useRef(1);

  // Crop state
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [cropDragging, setCropDragging] = useState(false);
  const [cropDragStart, setCropDragStart] = useState({ x: 0, y: 0, rx: 0, ry: 0 });
  const [cropResizing, setCropResizing] = useState<string | null>(null);
  const [cropResizeStart, setCropResizeStart] = useState({ x: 0, y: 0, rect: { x: 0, y: 0, w: 0, h: 0 } });
  const [cropCanvasSize, setCropCanvasSize] = useState({ w: 0, h: 0 });

  // --- Resize ---
  const onResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    aspectRef.current = img.naturalWidth / img.naturalHeight;
    resizeStartRef.current = { startX: e.clientX, startY: e.clientY, startW: img.offsetWidth, corner };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const info = resizeStartRef.current;
      if (!info) return;
      const dx = e.clientX - info.startX;
      const isLeft = info.corner.includes('l');
      const delta = isLeft ? -dx : dx;
      const newW = Math.max(MIN_WIDTH, info.startW + delta);
      updateAttributes({ width: newW });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizing, updateAttributes]);

  // --- Alignment ---
  const setAlign = useCallback((a: string) => {
    updateAttributes({ align: a });
  }, [updateAttributes]);

  // --- Crop ---
  const openCrop = useCallback(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cropImgRef.current = img;
      // Fit to max 600px wide for the overlay
      const maxW = Math.min(600, window.innerWidth - 80);
      const scale = maxW / img.naturalWidth;
      const cw = Math.round(img.naturalWidth * scale);
      const ch = Math.round(img.naturalHeight * scale);
      setCropCanvasSize({ w: cw, h: ch });
      setCropRect({ x: 0, y: 0, w: cw, h: ch });
      setIsCropping(true);
    };
    img.src = src;
  }, [src]);

  // Draw crop canvas
  useEffect(() => {
    if (!isCropping || !cropCanvasRef.current || !cropImgRef.current) return;
    const ctx = cropCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const { w: cw, h: ch } = cropCanvasSize;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(cropImgRef.current, 0, 0, cw, ch);
    // Dark overlay outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, cw, ch);
    // Clear the crop region
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.drawImage(cropImgRef.current,
      cropRect.x / cw * cropImgRef.current.naturalWidth,
      cropRect.y / ch * cropImgRef.current.naturalHeight,
      cropRect.w / cw * cropImgRef.current.naturalWidth,
      cropRect.h / ch * cropImgRef.current.naturalHeight,
      cropRect.x, cropRect.y, cropRect.w, cropRect.h
    );
    // Crop border
    ctx.strokeStyle = '#8B7BF5';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    // Corner handles
    const hs = 8;
    ctx.fillStyle = '#8B7BF5';
    for (const [cx, cy] of [
      [cropRect.x, cropRect.y],
      [cropRect.x + cropRect.w, cropRect.y],
      [cropRect.x, cropRect.y + cropRect.h],
      [cropRect.x + cropRect.w, cropRect.y + cropRect.h],
    ]) {
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
    }
  }, [isCropping, cropRect, cropCanvasSize]);

  // Crop drag to move
  const onCropMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hs = 10;
    // Check corners first for resize
    const corners = [
      { name: 'tl', x: cropRect.x, y: cropRect.y },
      { name: 'tr', x: cropRect.x + cropRect.w, y: cropRect.y },
      { name: 'bl', x: cropRect.x, y: cropRect.y + cropRect.h },
      { name: 'br', x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
    ];
    for (const c of corners) {
      if (Math.abs(mx - c.x) < hs && Math.abs(my - c.y) < hs) {
        setCropResizing(c.name);
        setCropResizeStart({ x: e.clientX, y: e.clientY, rect: { ...cropRect } });
        return;
      }
    }
    // Else move
    if (mx >= cropRect.x && mx <= cropRect.x + cropRect.w && my >= cropRect.y && my <= cropRect.y + cropRect.h) {
      setCropDragging(true);
      setCropDragStart({ x: e.clientX, y: e.clientY, rx: cropRect.x, ry: cropRect.y });
    }
  }, [cropRect]);

  useEffect(() => {
    if (!cropDragging && !cropResizing) return;
    const onMove = (e: MouseEvent) => {
      if (cropDragging) {
        const dx = e.clientX - cropDragStart.x;
        const dy = e.clientY - cropDragStart.y;
        let nx = cropDragStart.rx + dx;
        let ny = cropDragStart.ry + dy;
        nx = Math.max(0, Math.min(nx, cropCanvasSize.w - cropRect.w));
        ny = Math.max(0, Math.min(ny, cropCanvasSize.h - cropRect.h));
        setCropRect(r => ({ ...r, x: nx, y: ny }));
      }
      if (cropResizing) {
        const dx = e.clientX - cropResizeStart.x;
        const dy = e.clientY - cropResizeStart.y;
        const r = cropResizeStart.rect;
        let nx = r.x, ny = r.y, nw = r.w, nh = r.h;
        if (cropResizing.includes('r')) { nw = Math.max(30, r.w + dx); }
        if (cropResizing.includes('l')) { nx = r.x + dx; nw = Math.max(30, r.w - dx); }
        if (cropResizing.includes('b')) { nh = Math.max(30, r.h + dy); }
        if (cropResizing.includes('t')) { ny = r.y + dy; nh = Math.max(30, r.h - dy); }
        nx = Math.max(0, nx);
        ny = Math.max(0, ny);
        if (nx + nw > cropCanvasSize.w) nw = cropCanvasSize.w - nx;
        if (ny + nh > cropCanvasSize.h) nh = cropCanvasSize.h - ny;
        setCropRect({ x: nx, y: ny, w: nw, h: nh });
      }
    };
    const onUp = () => { setCropDragging(false); setCropResizing(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [cropDragging, cropResizing, cropDragStart, cropResizeStart, cropCanvasSize, cropRect.w, cropRect.h]);

  const applyCrop = useCallback(() => {
    const img = cropImgRef.current;
    if (!img) return;
    const { w: cw, h: ch } = cropCanvasSize;
    const sx = cropRect.x / cw * img.naturalWidth;
    const sy = cropRect.y / ch * img.naturalHeight;
    const sw = cropRect.w / cw * img.naturalWidth;
    const sh = cropRect.h / ch * img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/png');
    // Cap cropped image width to 600px if larger (retina screenshots can be huge)
    const croppedWidth = out.width > 600 ? 600 : null;
    updateAttributes({ src: dataUrl, width: croppedWidth });
    setIsCropping(false);
  }, [cropRect, cropCanvasSize, updateAttributes]);

  const alignStyle: React.CSSProperties =
    align === 'left' ? { float: 'left', marginRight: '1.5em', marginBottom: '0.5em' } :
    align === 'right' ? { float: 'right', marginLeft: '1.5em', marginBottom: '0.5em' } :
    { marginLeft: 'auto', marginRight: 'auto', display: 'block' };

  return (
    <NodeViewWrapper className="image-node-view" data-align={align || 'center'} style={{ position: 'relative', clear: align === 'center' ? 'both' : undefined }}>
      <div style={{ ...alignStyle, position: 'relative', width: width ? `${width}px` : undefined, maxWidth: '100%' }}>
        {/* Image */}
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          draggable={false}
          style={{
            width: width ? `${width}px` : '100%',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
            boxShadow: selected ? '0 0 0 2px var(--color-accent)' : 'var(--shadow-md)',
            cursor: 'default',
            display: 'block',
          }}
        />

        {/* Resize handles — visible on selection */}
        {selected && (
          <>
            {['tl', 'tr', 'bl', 'br'].map(corner => (
              <div
                key={corner}
                className="image-resize-handle"
                style={{
                  position: 'absolute',
                  width: 10, height: 10,
                  background: 'var(--color-accent)',
                  border: '2px solid white',
                  borderRadius: 2,
                  cursor: corner.includes('l') ? (corner.includes('t') ? 'nwse-resize' : 'nesw-resize') : (corner.includes('t') ? 'nesw-resize' : 'nwse-resize'),
                  top: corner.includes('t') ? -5 : undefined,
                  bottom: corner.includes('b') ? -5 : undefined,
                  left: corner.includes('l') ? -5 : undefined,
                  right: corner.includes('r') ? -5 : undefined,
                  zIndex: 10,
                }}
                onMouseDown={e => onResizeStart(e, corner)}
              />
            ))}
          </>
        )}

        {/* Floating toolbar on selection */}
        {selected && !isCropping && (
          <div className="image-toolbar" style={{
            position: 'absolute',
            top: -44,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '4px 6px',
              borderRadius: 8,
              background: 'var(--color-overlay, #1a1a2e)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              {/* Align Left */}
              <ToolBtn active={align === 'left'} title="Align Left" onClick={() => setAlign('left')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
              </ToolBtn>
              {/* Align Center */}
              <ToolBtn active={align === 'center' || !align} title="Align Center" onClick={() => setAlign('center')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
              </ToolBtn>
              {/* Align Right */}
              <ToolBtn active={align === 'right'} title="Align Right" onClick={() => setAlign('right')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
              </ToolBtn>
              <Sep />
              {/* Crop */}
              <ToolBtn active={false} title="Crop" onClick={openCrop}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2v4"/><path d="M6 6h12a2 2 0 0 1 2 2v12"/><path d="M18 22v-4"/><path d="M18 18H6a2 2 0 0 1-2-2V4"/></svg>
              </ToolBtn>
              {/* Alt text */}
              <ToolBtn active={editingAlt} title="Alt Text" onClick={() => { setEditingAlt(!editingAlt); setAltText(alt || ''); }}>
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'system-ui' }}>Alt</span>
              </ToolBtn>
              <Sep />
              {/* Delete */}
              <ToolBtn active={false} title="Delete" onClick={deleteNode}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </ToolBtn>
            </div>
            {/* Alt text input */}
            {editingAlt && (
              <div style={{
                marginTop: 4,
                display: 'flex',
                gap: 4,
                background: 'var(--color-overlay, #1a1a2e)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '4px 6px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}>
                <input
                  value={altText}
                  onChange={e => setAltText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      updateAttributes({ alt: altText });
                      setEditingAlt(false);
                    }
                    if (e.key === 'Escape') setEditingAlt(false);
                  }}
                  placeholder="Alt text..."
                  autoFocus
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: 'none',
                    outline: 'none',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 12,
                    width: 160,
                    fontFamily: 'system-ui',
                  }}
                />
                <button
                  onClick={() => { updateAttributes({ alt: altText }); setEditingAlt(false); }}
                  style={{
                    background: 'var(--color-accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Crop overlay */}
      {isCropping && (
        <div className="image-crop-overlay" onClick={() => setIsCropping(false)}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <canvas
              ref={cropCanvasRef}
              width={cropCanvasSize.w}
              height={cropCanvasSize.h}
              onMouseDown={onCropMouseDown}
              style={{ cursor: 'crosshair', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="image-crop-btn image-crop-btn-cancel" onClick={(e) => { e.stopPropagation(); setIsCropping(false); }}>
                Cancel
              </button>
              <button className="image-crop-btn image-crop-btn-apply" onClick={(e) => { e.stopPropagation(); applyCrop(); }}>
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

function ToolBtn({ children, active, title, onClick }: { children: React.ReactNode; active: boolean; title: string; onClick: () => void }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <button
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onClick(); }}
        style={{
          padding: 5, borderRadius: 4, border: 'none', cursor: 'pointer',
          background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
          color: active ? '#fff' : 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center',
        }}
      >
        {children}
      </button>
      {showTip && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 6, padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
          background: 'var(--color-ink)', color: 'var(--color-paper)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          fontFamily: 'system-ui',
        }}>
          {title}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 16, margin: '0 3px', background: 'rgba(255,255,255,0.2)' }} />;
}
