'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface GraphNode {
  id: string;
  title: string;
  linkCount: number;
  folder: string; // top-level folder for coloring
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphViewProps {
  nodes: Array<{ id: string; title: string; linkCount: number }>;
  edges: GraphEdge[];
  currentDocId?: string;
  onSelectNode?: (id: string) => void;
  onClose: () => void;
}

// --- Folder color palette ---
const FOLDER_COLORS = [
  '#6E57FF', // purple (default/root)
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
];

function folderColor(folder: string, folderList: string[]): string {
  if (!folder) return FOLDER_COLORS[0];
  const idx = folderList.indexOf(folder);
  return FOLDER_COLORS[(idx + 1) % FOLDER_COLORS.length]; // +1 so root gets purple
}

// --- Barnes-Hut Quadtree ---
interface QuadNode {
  cx: number; cy: number; mass: number;
  x0: number; y0: number; x1: number; y1: number;
  children: (QuadNode | null)[];
  body: GraphNode | null;
}

function buildQuadtree(nodes: GraphNode[]): QuadNode | null {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const pad = 10;
  const root = createQNode(minX - pad, minY - pad, maxX + pad, maxY + pad);
  for (const n of nodes) insertQNode(root, n);
  return root;
}

function createQNode(x0: number, y0: number, x1: number, y1: number): QuadNode {
  return { cx: 0, cy: 0, mass: 0, x0, y0, x1, y1, children: [null, null, null, null], body: null };
}

function insertQNode(quad: QuadNode, node: GraphNode) {
  if (quad.mass === 0) {
    quad.body = node; quad.cx = node.x; quad.cy = node.y; quad.mass = 1; return;
  }
  if (quad.body) {
    const old = quad.body; quad.body = null;
    insertChild(quad, old);
  }
  quad.cx = (quad.cx * quad.mass + node.x) / (quad.mass + 1);
  quad.cy = (quad.cy * quad.mass + node.y) / (quad.mass + 1);
  quad.mass += 1;
  insertChild(quad, node);
}

function insertChild(quad: QuadNode, node: GraphNode) {
  const mx = (quad.x0 + quad.x1) / 2;
  const my = (quad.y0 + quad.y1) / 2;
  const i = (node.x > mx ? 1 : 0) + (node.y > my ? 2 : 0);
  if (!quad.children[i]) {
    quad.children[i] = createQNode(i & 1 ? mx : quad.x0, i & 2 ? my : quad.y0, i & 1 ? quad.x1 : mx, i & 2 ? quad.y1 : my);
  }
  insertQNode(quad.children[i]!, node);
}

function applyRepulsion(node: GraphNode, quad: QuadNode | null, theta: number, alpha: number) {
  if (!quad || quad.mass === 0) return;
  const dx = quad.cx - node.x;
  const dy = quad.cy - node.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
  if ((quad.x1 - quad.x0) / dist < theta || quad.mass === 1) {
    if (dist < 1) return;
    const force = -600 * quad.mass / (dist * dist) * alpha;
    node.vx += (dx / dist) * force;
    node.vy += (dy / dist) * force;
    return;
  }
  for (const child of quad.children) if (child) applyRepulsion(node, child, theta, alpha);
}

function computeLayout(
  rawNodes: Array<{ id: string; title: string; linkCount: number }>,
  edges: GraphEdge[],
  iterations: number,
): GraphNode[] {
  const spread = Math.max(300, Math.sqrt(rawNodes.length) * 30);
  const nodes: GraphNode[] = rawNodes.map(n => ({
    ...n,
    folder: n.id.includes('/') ? n.id.split('/')[0] : '',
    x: (Math.random() - 0.5) * spread,
    y: (Math.random() - 0.5) * spread,
    vx: 0, vy: 0,
  }));

  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.3 * Math.pow(0.97, iter);
    if (alpha < 0.001) break;
    const tree = buildQuadtree(nodes);
    for (const n of nodes) applyRepulsion(n, tree, 0.7, alpha);
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 60) * 0.03 * alpha;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) { n.vx -= n.x * 0.004 * alpha; n.vy -= n.y * 0.004 * alpha; }
    for (const n of nodes) { n.vx *= 0.5; n.vy *= 0.5; n.x += n.vx; n.y += n.vy; }
  }
  for (const n of nodes) { n.vx = 0; n.vy = 0; }
  return nodes;
}

// --- Sanitize title ---
function cleanTitle(node: { id: string; title: string }): string {
  let t = node.title;
  if (!t || t === '---' || t.startsWith('---')) t = node.id.split('/').pop() || node.id;
  return t.length > 28 ? t.slice(0, 26) + '..' : t;
}

export default function GraphView({ nodes: rawNodes, edges, currentDocId, onSelectNode, onClose }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(currentDocId || null);
  const [freeMode, setFreeMode] = useState(false); // true after user deselects — all nodes hoverable
  const [layoutReady, setLayoutReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ type: 'pan' | 'node'; startX: number; startY: number; nodeId?: string } | null>(null);
  // Button hit areas (screen coords, updated each render)
  const buttonsRef = useRef<{ open: { x: number; y: number; w: number; h: number } | null; deselect: { x: number; y: number; w: number; h: number } | null }>({ open: null, deselect: null });

  // Unique folders for color mapping
  const folderListRef = useRef<string[]>([]);

  // Pre-compute layout
  useEffect(() => {
    setLayoutReady(false);
    const iterations = rawNodes.length > 500 ? 200 : rawNodes.length > 100 ? 300 : 400;
    const timer = setTimeout(() => {
      const nodes = computeLayout(rawNodes, edges, iterations);
      nodesRef.current = nodes;

      // Build folder list
      const folders = new Set<string>();
      for (const n of nodes) if (n.folder) folders.add(n.folder);
      folderListRef.current = Array.from(folders).sort();

      // Center camera on current doc's neighborhood (not full graph)
      const currentNode = currentDocId ? nodes.find(n => n.id === currentDocId) : null;
      const canvas = canvasRef.current;
      if (canvas && nodes.length > 0) {
        const rect = canvas.getBoundingClientRect();
        if (currentNode) {
          // Zoom to current doc's local cluster
          const adj = new Set<string>();
          for (const e of edges) {
            if (e.source === currentDocId) adj.add(e.target);
            if (e.target === currentDocId) adj.add(e.source);
          }
          const cluster = nodes.filter(n => n.id === currentDocId || adj.has(n.id));
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const n of cluster) {
            if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
          }
          const w = Math.max(maxX - minX, 200);
          const h = Math.max(maxY - minY, 200);
          const zoom = Math.min(rect.width / (w + 150), rect.height / (h + 150), 3);
          cameraRef.current = { x: -currentNode.x, y: -currentNode.y, zoom: Math.max(0.3, zoom) };
        } else {
          // Full graph fit
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const n of nodes) {
            if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
          }
          const w = maxX - minX || 400, h = maxY - minY || 400;
          const zoom = Math.min(rect.width / (w + 100), rect.height / (h + 100), 2);
          cameraRef.current = { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2, zoom: Math.max(0.15, zoom) };
        }
      }
      setLayoutReady(true);
    }, 10);
    return () => clearTimeout(timer);
  }, [rawNodes, edges, currentDocId]);

  // Adjacency lookup
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, new Set());
      if (!adj.has(edge.target)) adj.set(edge.target, new Set());
      adj.get(edge.source)!.add(edge.target);
      adj.get(edge.target)!.add(edge.source);
    }
    adjacencyRef.current = adj;
  }, [edges]);

  // Search matches (all matching nodes, not just first)
  const searchMatches = searchQuery.length >= 2
    ? nodesRef.current.filter(n =>
        n.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 20)
    : [];
  const searchMatchId = searchMatches.length > 0 ? searchMatches[Math.min(searchIndex, searchMatches.length - 1)]?.id : null;

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (sx - rect.width / 2) / cam.zoom - cam.x,
      y: (sy - rect.height / 2) / cam.zoom - cam.y,
    };
  }, []);

  const nodeAt = useCallback((wx: number, wy: number): GraphNode | null => {
    const nodes = nodesRef.current;
    const hitR = 8 / cameraRef.current.zoom;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const r = Math.max(2, 1.5 + Math.sqrt(n.linkCount) * 1.5) + hitR;
      const dx = n.x - wx, dy = n.y - wy;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const nodes = nodesRef.current;
      const cam = cameraRef.current;
      const adj = adjacencyRef.current;
      const folders = folderListRef.current;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#0b0c14';
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (!layoutReady || nodes.length === 0) {
        ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText(`Computing layout for ${rawNodes.length} docs...`, rect.width / 2, rect.height / 2);
        animRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.save();
      ctx.translate(rect.width / 2, rect.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(cam.x, cam.y);

      const nodeMap = new Map<string, GraphNode>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Focus = hovered > selected > search match > current doc
      const focusId = hoveredNode || selectedNode || searchMatchId || currentDocId || null;
      const focusNeighbors = focusId ? (adj.get(focusId) || new Set()) : new Set();
      const hasFocus = !!focusId;

      // Animate camera toward focused node (search match or selection)
      const cameraTarget = searchMatchId && !hoveredNode && !selectedNode
        ? nodeMap.get(searchMatchId)
        : selectedNode ? nodeMap.get(selectedNode)
        : null;
      if (cameraTarget) {
        cam.x += (-cameraTarget.x - cam.x) * 0.1;
        cam.y += (-cameraTarget.y - cam.y) * 0.1;
      }

      // --- Draw unfocused edges ---
      ctx.lineWidth = 0.3 / Math.max(cam.zoom, 0.3);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
      for (const edge of edges) {
        if (hasFocus && (edge.source === focusId || edge.target === focusId)) continue;
        const a = nodeMap.get(edge.source), b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      // --- Draw focused edges ---
      if (hasFocus) {
        ctx.strokeStyle = 'rgba(110, 87, 255, 0.35)';
        ctx.lineWidth = 1 / cam.zoom;
        for (const edge of edges) {
          if (edge.source !== focusId && edge.target !== focusId) continue;
          const a = nodeMap.get(edge.source), b = nodeMap.get(edge.target);
          if (!a || !b) continue;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // Set of all search-matched IDs for ring highlights
      const searchMatchSet = new Set(searchMatches.map(m => m.id));

      // --- Draw unfocused nodes (folder-colored, very dim) ---
      for (const n of nodes) {
        if (n.id === focusId || n.id === currentDocId || focusNeighbors.has(n.id)) continue;
        const r = Math.max(1.5, 1 + Math.sqrt(n.linkCount));
        const color = folderColor(n.folder, folders);
        const isSearchMatch = searchMatchSet.has(n.id);
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.globalAlpha = isSearchMatch ? 0.7 : hasFocus ? 0.06 : 0.25;
        ctx.fillStyle = isSearchMatch ? '#fff' : color;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Ring around search matches
        if (isSearchMatch) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1 / cam.zoom;
          ctx.stroke();
        }
      }

      // --- Draw focused cluster ---
      const labelPositions: Array<{ x: number; y: number; w: number }> = [];
      const focusedNodes = nodes.filter(n => n.id === focusId || n.id === currentDocId || focusNeighbors.has(n.id));

      for (const n of focusedNodes) {
        const r = Math.max(2, 1.5 + Math.sqrt(n.linkCount) * 1.5);
        const isFocus = n.id === focusId;
        const isCurrent = n.id === currentDocId;
        const color = folderColor(n.folder, folders);

        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

        if (isFocus) {
          ctx.fillStyle = hoveredNode ? '#fff' : color;
          ctx.shadowColor = 'rgba(255,255,255,0.4)';
          ctx.shadowBlur = 14;
          ctx.fill();
          ctx.shadowBlur = 0;
          // White selection ring
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.stroke();
        } else if (isCurrent && hoveredNode) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.5;
          ctx.fill();
          // Subtle ring for current doc
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1 / cam.zoom;
          ctx.stroke();
        } else {
          // Hover pulse for traversable neighbors
          const isHovered = n.id === hoveredNode;
          if (isHovered) {
            const pulse = Math.sin(Date.now() / 400) * 0.1 + 0.3;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
            ctx.lineWidth = 2 / cam.zoom;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          }
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.85;
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Zoom-tier label filtering
        const maxLabels = cam.zoom >= 0.8 ? 15 : cam.zoom >= 0.3 ? 5 : 0;
        if (!isFocus && !isCurrent && labelPositions.length >= maxLabels && cam.zoom < 2.0) continue;
        if (cam.zoom < 0.3 && !isFocus) continue;

        // Label with background pill for readability
        let label = cleanTitle(n);
        const fontSize = Math.max(9, Math.min(13, 11 / cam.zoom));
        ctx.font = `${isFocus ? 'bold ' : ''}${isFocus ? fontSize + 1 : fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const textW = ctx.measureText(label).width;
        let labelY = n.y - r - 8;
        const labelH = fontSize + 4;
        for (const prev of labelPositions) {
          if (Math.abs(n.x - prev.x) < (textW + prev.w) / 2 + 8 && Math.abs(labelY - prev.y) < labelH + 2) {
            labelY -= labelH + 2;
          }
        }
        labelPositions.push({ x: n.x, y: labelY, w: textW });
        // Background pill
        ctx.fillStyle = 'rgba(11, 12, 20, 0.85)';
        const pad = 4;
        ctx.beginPath();
        const rx = n.x - textW / 2 - pad;
        const ry = labelY - fontSize + 1;
        const rw = textW + pad * 2;
        const rh = fontSize + pad;
        ctx.roundRect(rx, ry, rw, rh, 3);
        ctx.fill();
        // Use purple pill for focused node
        if (isFocus) {
          ctx.fillStyle = 'rgba(110, 87, 255, 0.2)';
          ctx.strokeStyle = 'rgba(110, 87, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, 3);
          ctx.fill();
          ctx.stroke();
        }
        // Text
        ctx.textAlign = 'center';
        ctx.fillStyle = isFocus || isCurrent ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)';
        ctx.fillText(label, n.x, labelY);

      }

      ctx.restore();

      // --- Buttons for selected node (rendered in screen coords) ---
      buttonsRef.current = { open: null, deselect: null };
      if (selectedNode && !freeMode) {
        const selNode = nodeMap.get(selectedNode);
        if (selNode) {
          // Convert node world coords to screen coords
          const sx = (selNode.x + cam.x) * cam.zoom + rect.width / 2;
          const sy = (selNode.y + cam.y) * cam.zoom + rect.height / 2;
          const btnW = 70;
          const btnH = 26;
          const btnGap = 8;
          const btnY = sy + 20;

          // "Open" button
          const openX = sx - btnW - btnGap / 2;
          ctx.fillStyle = 'rgba(110, 87, 255, 0.85)';
          ctx.beginPath();
          ctx.roundRect(openX, btnY, btnW, btnH, 5);
          ctx.fill();
          ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText('Open', openX + btnW / 2, btnY + 17);
          buttonsRef.current.open = { x: openX, y: btnY, w: btnW, h: btnH };

          // "Back" button
          const backX = sx + btnGap / 2;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(backX, btnY, btnW, btnH, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillText('Back', backX + btnW / 2, btnY + 17);
          buttonsRef.current.deselect = { x: backX, y: btnY, w: btnW, h: btnH };
        }
      }

      // --- HUD ---
      const orphanCount = nodes.filter(n => n.linkCount === 0).length;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${nodes.length} docs  ${edges.length} links` + (orphanCount > 0 ? `  ${orphanCount} unlinked` : ''),
        16, rect.height - 16,
      );
      // Contextual keyboard hint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      const hintText = selectedNode && !freeMode
        ? 'Click neighbor to traverse  |  Scroll to zoom'
        : freeMode
          ? 'Click any node to explore  |  Esc to close'
          : 'Scroll to zoom  |  Esc to close';
      ctx.fillText(hintText, 16, rect.height - 32);

      // Folder legend (bottom right)
      if (folders.length > 0) {
        ctx.textAlign = 'right';
        const legendX = rect.width - 16;
        let legendY = rect.height - 16;
        for (let i = Math.min(folders.length, 8) - 1; i >= 0; i--) {
          const f = folders[i];
          const c = folderColor(f, folders);
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(legendX - ctx.measureText(f).width - 18, legendY - 9, 8, 8);
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillText(f, legendX, legendY);
          legendY -= 16;
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [edges, hoveredNode, selectedNode, currentDocId, layoutReady, searchMatchId, rawNodes.length]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = nodeAt(wx, wy);
    dragRef.current = node
      ? { type: 'node', startX: e.clientX, startY: e.clientY, nodeId: node.id }
      : { type: 'pan', startX: e.clientX, startY: e.clientY };
  }, [screenToWorld, nodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;
      if (dragRef.current.type === 'pan') {
        cameraRef.current.x += dx / cameraRef.current.zoom;
        cameraRef.current.y += dy / cameraRef.current.zoom;
      } else if (dragRef.current.nodeId) {
        const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
        if (node) { node.x += dx / cameraRef.current.zoom; node.y += dy / cameraRef.current.zoom; }
      }
    } else {
      const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const node = nodeAt(wx, wy);
      if (node) {
        if (freeMode) {
          // Free mode: all nodes hoverable
          setHoveredNode(node.id);
          if (canvasRef.current) canvasRef.current.style.cursor = 'pointer';
        } else {
          // Constrained: only neighborhood is hoverable
          const anchorId = selectedNode || currentDocId || null;
          const anchorNeighbors = anchorId ? (adjacencyRef.current.get(anchorId) || new Set()) : null;
          const isTraversable = !anchorNeighbors || node.id === anchorId || anchorNeighbors.has(node.id);
          setHoveredNode(isTraversable ? node.id : null);
          if (canvasRef.current) canvasRef.current.style.cursor = isTraversable ? 'pointer' : 'grab';
        }
      } else {
        setHoveredNode(null);
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }
    }
  }, [screenToWorld, nodeAt, selectedNode, currentDocId, freeMode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const moved = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
    if (moved >= 3) return; // was a drag, not a click

    // Check button hits first (screen coords)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const btns = buttonsRef.current;
      if (btns.open && mx >= btns.open.x && mx <= btns.open.x + btns.open.w && my >= btns.open.y && my <= btns.open.y + btns.open.h) {
        // Open button clicked — use ref for latest selectedNode
        const nodeToOpen = selectedNodeRef.current;
        if (nodeToOpen && onSelectNode) {
          onSelectNode(nodeToOpen);
          onCloseRef.current();
        }
        return;
      }
      if (btns.deselect && mx >= btns.deselect.x && mx <= btns.deselect.x + btns.deselect.w && my >= btns.deselect.y && my <= btns.deselect.y + btns.deselect.h) {
        // Back button clicked
        setSelectedNode(null);
        setFreeMode(true);
        return;
      }
    }

    if (drag.type === 'node' && drag.nodeId) {
      if (freeMode) {
        setSelectedNode(drag.nodeId);
        setFreeMode(false);
      } else {
        const anchorId = selectedNode || currentDocId || null;
        const anchorNeighbors = anchorId ? (adjacencyRef.current.get(anchorId) || new Set()) : null;
        const isTraversable = !anchorNeighbors || drag.nodeId === anchorId || anchorNeighbors.has(drag.nodeId);
        if (isTraversable) {
          setSelectedNode(drag.nodeId);
        }
      }
    } else {
      setSelectedNode(null);
      setFreeMode(true);
    }
  }, [selectedNode, currentDocId, freeMode, onSelectNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    cameraRef.current.zoom = Math.max(0.05, Math.min(8, cameraRef.current.zoom * (e.deltaY > 0 ? 0.93 : 1.07)));
  }, []);

  // Track whether user has interacted (selected/traversed). First Escape clears this, second closes.
  const [hasInteracted, setHasInteracted] = useState(false);
  // Set hasInteracted when user selects a node
  useEffect(() => { if (selectedNode) setHasInteracted(true); }, [selectedNode]);

  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const hasInteractedRef = useRef(hasInteracted);
  hasInteractedRef.current = hasInteracted;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchRef.current === document.activeElement) return;
        e.preventDefault();
        e.stopPropagation();
        if (selectedNodeRef.current) {
          // Deselect node, enter free exploration mode
          setSelectedNode(null);
          setFreeMode(true);
        } else {
          // Close the graph
          onCloseRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9997, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: '#0b0c14', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E57FF" strokeWidth="2">
            <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
            <line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-mono, monospace)' }}>
            Graph
          </span>
          {/* Search */}
          <div style={{ position: 'relative', marginLeft: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: searchFocused ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
              borderRadius: 6, padding: '3px 10px',
              border: `1px solid ${searchFocused ? 'rgba(110,87,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
              transition: 'all 0.15s',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Find doc..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchIndex(0); }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setSearchQuery(''); searchRef.current?.blur(); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIndex(i => Math.min(i + 1, searchMatches.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIndex(i => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && searchMatchId && onSelectNode) { onSelectNode(searchMatchId); onClose(); }
                }}
                style={{
                  background: 'none', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.8)',
                  fontSize: 12, fontFamily: 'var(--font-mono, monospace)', width: 180,
                }}
              />
              {searchMatches.length > 0 && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>
                  {Math.min(searchIndex + 1, searchMatches.length)}/{searchMatches.length}
                </span>
              )}
            </div>
            {/* Dropdown */}
            {searchFocused && searchMatches.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                width: 320, maxHeight: 280, overflowY: 'auto',
                background: '#151722', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', zIndex: 10,
              }}>
                {searchMatches.map((m, i) => (
                  <div
                    key={m.id}
                    onMouseDown={(e) => { e.preventDefault(); if (onSelectNode) { onSelectNode(m.id); onClose(); } }}
                    onMouseEnter={() => setSearchIndex(i)}
                    style={{
                      padding: '6px 12px', cursor: 'pointer',
                      background: i === searchIndex ? 'rgba(110,87,255,0.15)' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 12, color: i === searchIndex ? '#fff' : 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {cleanTitle(m)}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {m.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedNode && (
            <span style={{ fontSize: 11, color: 'rgba(110,87,255,0.7)', fontFamily: 'var(--font-mono, monospace)' }}>
              {selectedNode}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
            fontSize: 12, fontFamily: 'var(--font-mono, monospace)', padding: '4px 10px', borderRadius: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          ESC
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, width: '100%', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { dragRef.current = null; setHoveredNode(null); }}
        onWheel={handleWheel}
      />
    </div>
  );
}
