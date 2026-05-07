/**
 * ScreenshotWindow - 截屏主窗口（原生 Canvas 重写版本）
 *
 * 架构：
 *  - Background Canvas: 显示截图（只初始化一次）
 *  - Mask Canvas: 显示半透明遮罩 + 选区 + resize 句柄
 *  - Annotation Canvas: 显示标注 Shape
 *
 * 状态管理：useScreenshotStore (Zustand)
 * 工具管理：ToolManager（原生 Canvas）
 * 历史管理：CommandQueue（撤销/重做）
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

import type { CaptureResult, AppConfig } from '../../../types';
import type { SelectionRect, Point, Shape } from '../../../lib/screenshot/types';
import { useScreenshotStore } from '../../../hooks/useScreenshotStore';
import { Toolbar } from '../components/Toolbar';
import { Magnifier } from '../components/Magnifier';
import { SizeInfo } from '../components/SizeInfo';
import { TextInputOverlay } from '../components/TextInputOverlay';

// 光标样式映射
const CURSOR_MAP: Record<string, string> = {
  nw: 'nw-resize',
  n: 'n-resize',
  ne: 'ne-resize',
  e: 'e-resize',
  se: 'se-resize',
  s: 's-resize',
  sw: 'sw-resize',
  w: 'w-resize',
  move: 'move',
};

const HANDLE_SIZE = 8;

function getResizeHandles(sel: SelectionRect) {
  const { x, y, w, h } = sel;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return [
    { id: 'nw', x, y },
    { id: 'n', x: cx, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: cy },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: cx, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: cy },
  ];
}

function hitTestSelection(
  px: number,
  py: number,
  sel: SelectionRect,
  sf: { x: number; y: number }
): string | null {
  const sx = sel.x * sf.x,
    sy = sel.y * sf.y;
  const sw = sel.w * sf.x,
    sh = sel.h * sf.y;

  const handles = getResizeHandles({ x: sx, y: sy, w: sw, h: sh });
  for (const { id, x, y } of handles) {
    if (
      px >= x - HANDLE_SIZE &&
      px <= x + HANDLE_SIZE &&
      py >= y - HANDLE_SIZE &&
      py <= y + HANDLE_SIZE
    ) {
      return id;
    }
  }
  if (px >= sx && px <= sx + sw && py >= sy && py <= sy + sh) return 'move';
  return null;
}

function applyResizeHandle(
  handle: string,
  delta: Point,
  original: SelectionRect,
  sf: { x: number; y: number }
): SelectionRect {
  const dx = delta.x / sf.x;
  const dy = delta.y / sf.y;
  let { x, y, w, h } = original;
  switch (handle) {
    case 'nw':
      x += dx;
      y += dy;
      w -= dx;
      h -= dy;
      break;
    case 'n':
      y += dy;
      h -= dy;
      break;
    case 'ne':
      y += dy;
      w += dx;
      h -= dy;
      break;
    case 'e':
      w += dx;
      break;
    case 'se':
      w += dx;
      h += dy;
      break;
    case 's':
      h += dy;
      break;
    case 'sw':
      x += dx;
      w -= dx;
      h += dy;
      break;
    case 'w':
      x += dx;
      w -= dx;
      break;
  }
  return { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(1, w), h: Math.max(1, h) };
}

function isWebPSupported(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

// ============================================================
// 图形交互工具函数（物理像素坐标系）
// ============================================================

type BBox = { x: number; y: number; w: number; h: number };

/** 获取 shape 的包围盒（物理像素） */
function getShapeBBox(shape: Shape): BBox {
  switch (shape.type) {
    case 'rect':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'ellipse':
      return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, w: shape.rx * 2, h: shape.ry * 2 };
    case 'arrow': {
      const x = Math.min(shape.x1, shape.x2);
      const y = Math.min(shape.y1, shape.y2);
      return {
        x,
        y,
        w: Math.abs(shape.x2 - shape.x1) || 4,
        h: Math.abs(shape.y2 - shape.y1) || 4,
      };
    }
    case 'pen': {
      if (!shape.points.length) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX || 4, h: maxY - minY || 4 };
    }
    case 'text': {
      const lineCount = (shape.text || ' ').split('\n').length;
      return {
        x: shape.x,
        y: shape.y - shape.fontSize,
        w: 160,
        h: shape.fontSize * 1.4 * lineCount,
      };
    }
    case 'blur':
    case 'mosaic':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }
}

/** 点击测试（包围盒 + padding） */
function hitTestShapeBBox(px: number, py: number, shape: Shape, padding = 8): boolean {
  const { x, y, w, h } = getShapeBBox(shape);
  return px >= x - padding && px <= x + w + padding && py >= y - padding && py <= y + h + padding;
}

/** 获取包围盒的 8 个 resize 句柄 */
function getShapeHandles(bbox: BBox) {
  const { x, y, w, h } = bbox;
  const cx = x + w / 2,
    cy = y + h / 2;
  return [
    { id: 'nw', x, y },
    { id: 'n', x: cx, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: cy },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: cx, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: cy },
  ];
}

/** 命中测试 resize 句柄 */
function hitTestShapeHandle(px: number, py: number, bbox: BBox, hs = 7): string | null {
  for (const { id, x, y } of getShapeHandles(bbox)) {
    if (px >= x - hs && px <= x + hs && py >= y - hs && py <= y + hs) return id;
  }
  return null;
}

/** 该形状是否支持 resize */
function isResizableShape(shape: Shape): boolean {
  return shape.type === 'rect' || shape.type === 'ellipse';
}

/** 移动 shape（物理像素 delta） */
function moveShapeBy(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.type) {
    case 'rect':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'arrow':
      return {
        ...shape,
        x1: shape.x1 + dx,
        y1: shape.y1 + dy,
        x2: shape.x2 + dx,
        y2: shape.y2 + dy,
      };
    case 'pen':
      return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'blur':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'mosaic':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
}

/** 调整 shape 大小（从拖拽起始 shape + 总 delta 计算，避免累积误差） */
function resizeShapeBy(shape: Shape, handle: string, delta: { x: number; y: number }): Shape {
  const dx = delta.x,
    dy = delta.y;
  if (shape.type === 'rect') {
    let { x, y, w, h } = shape;
    switch (handle) {
      case 'nw':
        x += dx;
        y += dy;
        w -= dx;
        h -= dy;
        break;
      case 'n':
        y += dy;
        h -= dy;
        break;
      case 'ne':
        y += dy;
        w += dx;
        h -= dy;
        break;
      case 'e':
        w += dx;
        break;
      case 'se':
        w += dx;
        h += dy;
        break;
      case 's':
        h += dy;
        break;
      case 'sw':
        x += dx;
        w -= dx;
        h += dy;
        break;
      case 'w':
        x += dx;
        w -= dx;
        break;
    }
    return { ...shape, x: Math.max(0, x), y: Math.max(0, y), w: Math.max(4, w), h: Math.max(4, h) };
  }
  if (shape.type === 'ellipse') {
    const bbox = getShapeBBox(shape);
    let { x, y, w, h } = bbox;
    switch (handle) {
      case 'nw':
        x += dx;
        y += dy;
        w -= dx;
        h -= dy;
        break;
      case 'n':
        y += dy;
        h -= dy;
        break;
      case 'ne':
        y += dy;
        w += dx;
        h -= dy;
        break;
      case 'e':
        w += dx;
        break;
      case 'se':
        w += dx;
        h += dy;
        break;
      case 's':
        h += dy;
        break;
      case 'sw':
        x += dx;
        w -= dx;
        h += dy;
        break;
      case 'w':
        x += dx;
        w -= dx;
        break;
    }
    w = Math.max(4, w);
    h = Math.max(4, h);
    return { ...shape, cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
  }
  return shape;
}

/** 在 annotation canvas 上绘制选中图形的高亮框 + 句柄 */
function renderShapeSelection(ctx: CanvasRenderingContext2D, shape: Shape) {
  const bbox = getShapeBBox(shape);
  const { x, y, w, h } = bbox;
  ctx.save();
  ctx.strokeStyle = '#1890ff';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  ctx.setLineDash([]);
  const hs = 5;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1890ff';
  ctx.lineWidth = 1;
  const handles = isResizableShape(shape) ? getShapeHandles(bbox) : [];
  handles.forEach(({ x: hx, y: hy }) => {
    ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
    ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
  });
  ctx.restore();
}

export default function ScreenshotWindow() {
  useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const annotationRef = useRef<HTMLCanvasElement>(null);

  const store = useScreenshotStore();
  const {
    isReady,
    selection,
    activeToolType,
    shapes,
    isDrawing,
    drawingConfig,
    screenshotFormat,
    screenshotQuality,
    screenshotSaveAction,
    mousePos,
    pixelColor,
    scaleFactor,
    textInput,
    toolManager,
    bgCanvas,
    setBgCanvas,
    setMaskCanvas,
    setAnnotationCanvas,
    setCaptures,
    setCurrentCapture,
    setIsReady,
    setScaleFactor,
    setSelection,
    setIsSelecting,
    setActiveTool,
    addShape,
    setIsDrawing,
    setMousePos,
    setPixelColor,
    setTextInput,
    completeTextInput,
    setScreenshotFormat,
    setScreenshotQuality,
    setScreenshotSaveAction,
    updateShape,
    removeShape,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = store;

  // 交互状态 refs（不需要触发重渲染）
  const selStartRef = useRef<Point>({ x: 0, y: 0 });
  const selOrigRef = useRef<SelectionRect | null>(null);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const resizeHandleRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const currentSelRef = useRef<SelectionRect | null>(null);
  // 避免 stale closure：用 ref 跟踪 isDrawing / isSelecting、15
  const isDrawingRef = useRef(false);
  const isSelectingRef = useRef(false);

  // 图形选中交互状态
  const [selectedShapeId, setSelectedShapeIdState] = React.useState<string | null>(null);
  const selectedShapeIdRef = useRef<string | null>(null);
  const setSelectedShapeId = React.useCallback((id: string | null) => {
    selectedShapeIdRef.current = id;
    setSelectedShapeIdState(id);
  }, []);
  const isDraggingShapeRef = useRef(false);
  const isResizingShapeRef = useRef(false);
  const shapeResizeHandleRef = useRef<string | null>(null);
  const shapeInteractStartMouseRef = useRef<Point>({ x: 0, y: 0 });
  const shapeInteractStartShapeRef = useRef<Shape | null>(null);
  // shapes 的 ref，用于在事件处理函数中读取最新数据（避免 re-create handler on every shape change）
  const shapesRef = useRef<Shape[]>(shapes);
  React.useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  // ==================== Canvas 注册 ====================
  useEffect(() => {
    if (bgRef.current) setBgCanvas(bgRef.current);
    if (maskRef.current) setMaskCanvas(maskRef.current);
    if (annotationRef.current) setAnnotationCanvas(annotationRef.current);
  }, [setBgCanvas, setMaskCanvas, setAnnotationCanvas]);

  // ==================== 渲染遮罩 ====================
  const renderMask = useCallback(
    (sel: SelectionRect | null, selecting: boolean) => {
      const cvs = maskRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      if (!ctx) return;
      const sf = scaleFactor;

      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, cvs.width, cvs.height);

      if (!sel || sel.w < 1 || sel.h < 1) return;

      const sx = sel.x * sf.x,
        sy = sel.y * sf.y;
      const sw = sel.w * sf.x,
        sh = sel.h * sf.y;
      ctx.clearRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, sw, sh);

      if (!selecting && sel.w > 10 && sel.h > 10) {
        const hs = HANDLE_SIZE;
        const handles = getResizeHandles({ x: sx, y: sy, w: sw, h: sh });
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#1890ff';
        ctx.lineWidth = 1;
        handles.forEach(({ x: hx, y: hy }) => {
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        });
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(sx + (sw / 3) * i, sy);
          ctx.lineTo(sx + (sw / 3) * i, sy + sh);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx, sy + (sh / 3) * i);
          ctx.lineTo(sx + sw, sy + (sh / 3) * i);
          ctx.stroke();
        }
      }
    },
    [scaleFactor]
  );

  // ==================== 渲染标注 ====================
  const renderAnnotation = useCallback(() => {
    const cvs = annotationRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    // 使用 getState() 读取最新 shapes/bgCanvas，避免 stale closure 问题
    const { shapes: latestShapes, bgCanvas: latestBg } = useScreenshotStore.getState();
    toolManager.renderShapes(ctx, latestShapes, latestBg ?? undefined);
    // 绘制选中图形高亮
    const selId = selectedShapeIdRef.current;
    if (selId) {
      const selShape = latestShapes.find((s) => s.id === selId);
      if (selShape) renderShapeSelection(ctx, selShape);
    }
    if (isDrawingRef.current) toolManager.renderTemp(ctx);
  }, [toolManager]); // 使用 getState() 所以不需要 shapes/bgCanvas 作为依赖

  // shapes 或 selectedShapeId 改变时重绘 annotation canvas
  useEffect(() => {
    requestAnimationFrame(renderAnnotation);
  }, [renderAnnotation, shapes, selectedShapeId]);

  // ==================== 像素颜色 ====================
  const updatePixelColor = useCallback(
    (px: number, py: number) => {
      const canvas = bgRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      try {
        const d = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
        const r = d[0],
          g = d[1],
          b = d[2];
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        setPixelColor({ r, g, b, hex });
      } catch {
        /* 忽略越界 */
      }
    },
    [setPixelColor]
  );

  // ==================== 坐标转换 ====================
  const toPhysical = useCallback(
    (clientX: number, clientY: number): Point => ({
      x: clientX * scaleFactor.x,
      y: clientY * scaleFactor.y,
    }),
    [scaleFactor]
  );

  const toLogical = useCallback(
    (px: number, py: number): Point => ({
      x: px / scaleFactor.x,
      y: py / scaleFactor.y,
    }),
    [scaleFactor]
  );

  // ==================== 鼠标事件 ====================
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      // 如果点击来自工具栏/文本输入等 UI 元素（data-no-interaction），则忽略
      // React 的 onMouseDown.stopPropagation() 无法阻止 native addEventListener，必须在这里手动过滤
      if ((e.target as HTMLElement).closest('[data-no-interaction]')) return;
      e.preventDefault();
      e.stopPropagation();

      const phys = toPhysical(e.clientX, e.clientY);
      const sel = currentSelRef.current;

      // 工具模式
      if (activeToolType && sel) {
        if (activeToolType === 'text') {
          toolManager.onMouseDown(phys, { drawingConfig, selection: sel });
          setTextInput({ pos: phys, config: drawingConfig });
        } else {
          isDrawingRef.current = true;
          setIsDrawing(true);
          toolManager.onMouseDown(phys, { drawingConfig, selection: sel });
        }
        return;
      }

      // 选区操作（调整/移动）—— 仅在无活动工具且无图形被命中时才触发
      // 图形交互：无活动工具 + 有选区 + 有图形时
      if (!activeToolType && sel && sel.w > 10 && sel.h > 10) {
        // 先测试当前选中图形的 resize 句柄
        const curSelId = selectedShapeIdRef.current;
        if (curSelId) {
          const curShape = shapesRef.current.find((s) => s.id === curSelId);
          if (curShape && isResizableShape(curShape)) {
            const bbox = getShapeBBox(curShape);
            const handle = hitTestShapeHandle(phys.x, phys.y, bbox);
            if (handle) {
              isResizingShapeRef.current = true;
              shapeResizeHandleRef.current = handle;
              shapeInteractStartMouseRef.current = { ...phys };
              shapeInteractStartShapeRef.current = { ...curShape } as Shape;
              return;
            }
          }
        }
        // 命中测试所有图形（后绘制的优先）
        const currentShapes = shapesRef.current;
        for (let i = currentShapes.length - 1; i >= 0; i--) {
          if (hitTestShapeBBox(phys.x, phys.y, currentShapes[i])) {
            setSelectedShapeId(currentShapes[i].id);
            isDraggingShapeRef.current = true;
            shapeInteractStartMouseRef.current = { ...phys };
            shapeInteractStartShapeRef.current = { ...currentShapes[i] } as Shape;
            return;
          }
        }
        // 没命中任何图形 → 取消选中，然后继续检查选区交互
        setSelectedShapeId(null);
      }

      // 选区操作（调整/移动）
      if (sel && sel.w > 10 && sel.h > 10) {
        const hit = hitTestSelection(phys.x, phys.y, sel, scaleFactor);
        if (hit) {
          if (hit === 'move') {
            isDraggingRef.current = true;
          } else {
            isResizingRef.current = true;
            resizeHandleRef.current = hit;
          }
          dragStartRef.current = phys;
          selOrigRef.current = { ...sel };
          return;
        }
      }

      // 新建选区
      isSelectingRef.current = true;
      setIsSelecting(true);
      selStartRef.current = phys;
      const newSel: SelectionRect = {
        x: phys.x / scaleFactor.x,
        y: phys.y / scaleFactor.y,
        w: 0,
        h: 0,
      };
      currentSelRef.current = newSel;
      setSelection(newSel);
    },
    [
      activeToolType,
      drawingConfig,
      scaleFactor,
      toolManager,
      toPhysical,
      setIsSelecting,
      setSelection,
      setIsDrawing,
      setTextInput,
      setSelectedShapeId,
    ]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const phys = toPhysical(e.clientX, e.clientY);
      const logical = toLogical(phys.x, phys.y);
      setMousePos(logical);
      updatePixelColor(phys.x, phys.y);

      if (isDrawingRef.current && activeToolType) {
        toolManager.onMouseMove(phys, { drawingConfig, selection: currentSelRef.current });
        requestAnimationFrame(renderAnnotation);
        return;
      }

      if (isDraggingRef.current && selOrigRef.current) {
        const dx = phys.x - dragStartRef.current.x;
        const dy = phys.y - dragStartRef.current.y;
        const orig = selOrigRef.current;
        const newSel: SelectionRect = {
          x: orig.x + dx / scaleFactor.x,
          y: orig.y + dy / scaleFactor.y,
          w: orig.w,
          h: orig.h,
        };
        currentSelRef.current = newSel;
        setSelection(newSel);
        renderMask(newSel, false);
        return;
      }

      // 图形拖拽
      if (isDraggingShapeRef.current && shapeInteractStartShapeRef.current) {
        const dx = phys.x - shapeInteractStartMouseRef.current.x;
        const dy = phys.y - shapeInteractStartMouseRef.current.y;
        const newShape = moveShapeBy(shapeInteractStartShapeRef.current, dx, dy);
        updateShape(newShape.id, () => newShape);
        requestAnimationFrame(renderAnnotation);
        return;
      }

      // 图形缩放
      if (
        isResizingShapeRef.current &&
        shapeInteractStartShapeRef.current &&
        shapeResizeHandleRef.current
      ) {
        const delta = {
          x: phys.x - shapeInteractStartMouseRef.current.x,
          y: phys.y - shapeInteractStartMouseRef.current.y,
        };
        const newShape = resizeShapeBy(
          shapeInteractStartShapeRef.current,
          shapeResizeHandleRef.current,
          delta
        );
        updateShape(newShape.id, () => newShape);
        requestAnimationFrame(renderAnnotation);
        return;
      }

      if (isResizingRef.current && selOrigRef.current && resizeHandleRef.current) {
        const delta: Point = {
          x: phys.x - dragStartRef.current.x,
          y: phys.y - dragStartRef.current.y,
        };
        const newSel = applyResizeHandle(
          resizeHandleRef.current,
          delta,
          selOrigRef.current,
          scaleFactor
        );
        currentSelRef.current = newSel;
        setSelection(newSel);
        renderMask(newSel, false);
        return;
      }

      if (isSelectingRef.current) {
        const x = Math.min(phys.x, selStartRef.current.x);
        const y = Math.min(phys.y, selStartRef.current.y);
        const w = Math.abs(phys.x - selStartRef.current.x);
        const h = Math.abs(phys.y - selStartRef.current.y);
        const newSel: SelectionRect = {
          x: x / scaleFactor.x,
          y: y / scaleFactor.y,
          w: w / scaleFactor.x,
          h: h / scaleFactor.y,
        };
        currentSelRef.current = newSel;
        setSelection(newSel);
        renderMask(newSel, true);
        return;
      }

      // 更新光标
      const sel = currentSelRef.current;
      if (containerRef.current) {
        debugger;
        let cursor = activeToolType ? toolManager.getCursor() : 'crosshair';
        if (!activeToolType && sel && sel.w > 10 && sel.h > 10) {
          // 检查选中图形的 resize 句柄
          const curSelId = selectedShapeIdRef.current;
          if (curSelId) {
            const curShape = shapesRef.current.find((s) => s.id === curSelId);
            if (curShape && isResizableShape(curShape)) {
              const handle = hitTestShapeHandle(phys.x, phys.y, getShapeBBox(curShape));
              if (handle) {
                cursor = CURSOR_MAP[handle] ?? 'nwse-resize';
              } else if (hitTestShapeBBox(phys.x, phys.y, curShape, 4)) {
                cursor = 'move';
              } else {
                // 检查其他图形
                const hovered = shapesRef.current
                  .slice()
                  .reverse()
                  .find((s) => hitTestShapeBBox(phys.x, phys.y, s, 4));
                if (hovered) cursor = 'move';
                else {
                  const selHit = hitTestSelection(phys.x, phys.y, sel, scaleFactor);
                  if (selHit) cursor = CURSOR_MAP[selHit] ?? 'crosshair';
                }
              }
            } else {
              const hovered = shapesRef.current
                .slice()
                .reverse()
                .find((s) => hitTestShapeBBox(phys.x, phys.y, s, 4));
              if (hovered) cursor = 'move';
              else {
                const selHit = hitTestSelection(phys.x, phys.y, sel, scaleFactor);
                if (selHit) cursor = CURSOR_MAP[selHit] ?? 'crosshair';
              }
            }
          } else {
            const hovered = shapesRef.current
              .slice()
              .reverse()
              .find((s) => hitTestShapeBBox(phys.x, phys.y, s, 4));
            if (hovered) cursor = 'move';
            else {
              const selHit = hitTestSelection(phys.x, phys.y, sel, scaleFactor);
              if (selHit) cursor = CURSOR_MAP[selHit] ?? 'crosshair';
            }
          }
        } else if (!activeToolType && sel) {
          const selHit = hitTestSelection(phys.x, phys.y, sel, scaleFactor);
          if (selHit) cursor = CURSOR_MAP[selHit] ?? 'crosshair';
        }
        containerRef.current.style.cursor = cursor;
      }
    },
    [
      activeToolType,
      scaleFactor,
      drawingConfig,
      toolManager,
      toPhysical,
      toLogical,
      renderAnnotation,
      renderMask,
      setMousePos,
      updatePixelColor,
      setSelection,
      updateShape,
    ]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      const phys = toPhysical(e.clientX, e.clientY);

      // 使用 ref 值避免 stale closure（state 更新异步，mouseup 可能早于 re-render）
      if (isDrawingRef.current && activeToolType && activeToolType !== 'text') {
        isDrawingRef.current = false;
        setIsDrawing(false);
        const shape = toolManager.onMouseUp(
          phys,
          { drawingConfig, selection: currentSelRef.current },
          bgCanvas ?? undefined
        );
        if (shape) addShape(shape);
        requestAnimationFrame(renderAnnotation);
        return;
      }

      // 图形拖拽 / 缩放结束
      if (isDraggingShapeRef.current || isResizingShapeRef.current) {
        isDraggingShapeRef.current = false;
        isResizingShapeRef.current = false;
        shapeResizeHandleRef.current = null;
        shapeInteractStartShapeRef.current = null;
        requestAnimationFrame(renderAnnotation);
        return;
      }

      if (isDraggingRef.current || isResizingRef.current) {
        isDraggingRef.current = false;
        isResizingRef.current = false;
        resizeHandleRef.current = null;
        const sel = currentSelRef.current;
        if (sel) renderMask(sel, false);
        return;
      }
      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        setIsSelecting(false);
        const sel = currentSelRef.current;
        if (!sel || sel.w < 10 || sel.h < 10) {
          const bg = bgRef.current;
          if (bg) {
            const fullSel: SelectionRect = {
              x: 0,
              y: 0,
              w: bg.width / scaleFactor.x,
              h: bg.height / scaleFactor.y,
            };
            currentSelRef.current = fullSel;
            setSelection(fullSel);
            renderMask(fullSel, false);
          }
        } else {
          renderMask(sel, false);
        }
      }
    },
    [
      activeToolType,
      scaleFactor,
      drawingConfig,
      bgCanvas,
      toolManager,
      toPhysical,
      addShape,
      renderAnnotation,
      renderMask,
      setIsDrawing,
      setIsSelecting,
      setSelection,
    ]
  );

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      const phys = toPhysical(e.clientX, e.clientY);
      // 双击文字图形时重新编辑
      const currentShapes = shapesRef.current;
      for (let i = currentShapes.length - 1; i >= 0; i--) {
        const s = currentShapes[i];
        if (s.type === 'text' && hitTestShapeBBox(phys.x, phys.y, s)) {
          removeShape(s.id);
          setSelectedShapeId(null);
          setTextInput({
            pos: { x: s.x, y: s.y },
            config: { ...drawingConfig, strokeColor: s.color, fontSize: s.fontSize },
          });
          return;
        }
      }
      // 双击空白区域：如果还没有选区则全屏选中
      if (!currentSelRef.current) {
        const bg = bgRef.current;
        if (!bg) return;
        const fullSel: SelectionRect = {
          x: 0,
          y: 0,
          w: bg.width / scaleFactor.x,
          h: bg.height / scaleFactor.y,
        };
        currentSelRef.current = fullSel;
        setSelection(fullSel);
        renderMask(fullSel, false);
      }
    },
    [
      scaleFactor,
      setSelection,
      renderMask,
      drawingConfig,
      removeShape,
      setSelectedShapeId,
      setTextInput,
      toPhysical,
    ]
  );

  // ==================== 键盘快捷键 ====================
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 有选中图形先取消选中，再 Esc 关闭
        if (selectedShapeIdRef.current) {
          setSelectedShapeId(null);
          return;
        }
        invoke('close_capture').catch(console.error);
        return;
      }
      if (e.key === 'Enter') {
        handleConfirm();
        return;
      }
      // Delete / Backspace 删除选中图形
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeIdRef.current) {
        const id = selectedShapeIdRef.current;
        setSelectedShapeId(null);
        removeShape(id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, removeShape, setSelectedShapeId]);

  // ==================== 绑定 Canvas 事件 ====================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('dblclick', handleDoubleClick);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleDoubleClick]);

  // ==================== 加载截图数据 ====================
  const loadCapture = useCallback(
    async (cap: CaptureResult) => {
      const bgCvs = bgRef.current;
      const maskCvs = maskRef.current;
      const annCvs = annotationRef.current;
      if (!bgCvs || !maskCvs || !annCvs) return;

      bgCvs.width = cap.width;
      bgCvs.height = cap.height;
      maskCvs.width = cap.width;
      maskCvs.height = cap.height;
      annCvs.width = cap.width;
      annCvs.height = cap.height;

      const rect = bgCvs.getBoundingClientRect();
      const sf = { x: cap.width / rect.width, y: cap.height / rect.height };
      setScaleFactor(sf);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const ctx = bgCvs.getContext('2d', { willReadFrequently: true });
          ctx?.drawImage(img, 0, 0, cap.width, cap.height);
          resolve();
        };
        img.onerror = reject;
        img.src = convertFileSrc(cap.path);
      });

      const maskCtx = maskCvs.getContext('2d');
      if (maskCtx) {
        maskCtx.fillStyle = 'rgba(0,0,0,0.5)';
        maskCtx.fillRect(0, 0, cap.width, cap.height);
      }
      setIsReady(true);
    },
    [setScaleFactor, setIsReady]
  );

  // ==================== 截屏初始化 ====================
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const init = async () => {
      try {
        const config = await invoke<AppConfig>('get_config').catch(() => ({}) as AppConfig);
        setScreenshotFormat((config.screenshot_format as 'png' | 'jpeg' | 'webp') ?? 'png');
        setScreenshotQuality(config.screenshot_quality ?? 90);
        setScreenshotSaveAction(
          (config.screenshot_save_action as 'clipboard' | 'file' | 'both') ?? 'clipboard'
        );

        unlisten = await listen<{ captures: CaptureResult[] }>(
          'screenshot-ready',
          async (event) => {
            const caps = event.payload.captures;
            setCaptures(caps);
            const cap = caps[0];
            if (!cap) return;
            setCurrentCapture(cap);
            await new Promise((r) => requestAnimationFrame(r));
            await loadCapture(cap);
          }
        );

        // 尝试获取已有截图数据
        const existing = await invoke<CaptureResult[]>('get_capture_data').catch(
          (): CaptureResult[] => []
        );
        if (existing.length > 0) {
          setCaptures(existing);
          const cap = existing[0];
          setCurrentCapture(cap);
          await new Promise((r) => requestAnimationFrame(r));
          await loadCapture(cap);
        }

        await invoke('screenshot_window_ready').catch(() => {});
      } catch (err) {
        console.error('Screenshot init error:', err);
      }
    };

    init();
    return () => {
      unlisten?.();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== 导出 ====================
  const exportCanvas = useCallback(async (): Promise<string> => {
    const sel = currentSelRef.current;
    if (!sel) return '';
    const bgCvs = bgRef.current;
    const annCvs = annotationRef.current;
    if (!bgCvs || !annCvs) return '';

    const sf = scaleFactor;
    const sx = Math.round(sel.x * sf.x);
    const sy = Math.round(sel.y * sf.y);
    const sw = Math.round(sel.w * sf.x);
    const sh = Math.round(sel.h * sf.y);

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = sw;
    tmpCanvas.height = sh;
    const ctx = tmpCanvas.getContext('2d')!;
    ctx.drawImage(bgCvs, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.drawImage(annCvs, sx, sy, sw, sh, 0, 0, sw, sh);

    const fmt = screenshotFormat === 'webp' && !isWebPSupported() ? 'png' : screenshotFormat;
    const quality = fmt === 'png' ? 1 : screenshotQuality / 100;
    return tmpCanvas.toDataURL(`image/${fmt}`, quality);
  }, [scaleFactor, screenshotFormat, screenshotQuality]);

  const handleConfirm = useCallback(async () => {
    try {
      const dataUrl = await exportCanvas();
      if (!dataUrl) return;
      if (screenshotSaveAction === 'clipboard' || screenshotSaveAction === 'both') {
        await invoke('save_captured_image', {
          base64Data: dataUrl,
          format: screenshotFormat,
          quality: screenshotQuality,
        });
      }
      if (screenshotSaveAction === 'file' || screenshotSaveAction === 'both') {
        await invoke('save_screenshot_to_file', {
          base64Data: dataUrl,
          format: screenshotFormat,
        }).catch(() => {});
      }
      await invoke('close_capture');
    } catch (err) {
      console.error('Confirm error:', err);
    }
  }, [exportCanvas, screenshotFormat, screenshotQuality, screenshotSaveAction]);

  const handleDownload = useCallback(async () => {
    try {
      const dataUrl = await exportCanvas();
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `screenshot-${Date.now()}.${screenshotFormat}`;
      a.click();
    } catch (err) {
      console.error('Download error:', err);
    }
  }, [exportCanvas, screenshotFormat]);

  const handleCancel = useCallback(() => {
    invoke('close_capture').catch(console.error);
  }, []);

  // ==================== UI 位置计算 ====================
  const getToolbarPosition = (): React.CSSProperties | null => {
    if (!selection || selection.w <= 10 || selection.h <= 10) return null;
    const margin = 8;
    let top = selection.y + selection.h + margin;
    if (top + 44 > window.innerHeight) top = selection.y - 44 - margin;
    if (top < 0) top = selection.y + margin;
    return { position: 'absolute', left: selection.x, top };
  };

  const getMagnifierPosition = (): React.CSSProperties | null => {
    const { x, y } = mousePos;
    const magW = 136,
      magH = 156,
      offset = 20;
    let left = x + offset;
    let top = y + offset;
    if (left + magW > window.innerWidth) left = x - magW - offset;
    if (left < 0) left = 0;
    if (top + magH > window.innerHeight) top = y - magH - offset;
    if (top < 0) top = 0;
    return { position: 'absolute', left, top };
  };

  const getSizeInfoPosition = (): React.CSSProperties | null => {
    if (!selection || selection.w <= 0 || selection.h <= 0) return null;
    const top = selection.y > 24 ? selection.y - 24 : selection.y + 4;
    return { position: 'absolute', left: selection.x, top };
  };

  const toolbarPos = getToolbarPosition();
  const magPos = getMagnifierPosition();
  const sizeInfoPos = getSizeInfoPosition();

  return (
    <div
      ref={containerRef}
      className="w-screen h-screen overflow-hidden relative select-none"
      style={{ cursor: activeToolType ? toolManager.getCursor() : 'crosshair' }}
    >
      {/* Background Canvas */}
      <canvas ref={bgRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />

      {/* Mask Canvas */}
      <canvas ref={maskRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />

      {/* Annotation Canvas */}
      <canvas
        ref={annotationRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />

      {/* 选区尺寸 */}
      {selection && sizeInfoPos && <SizeInfo selection={selection} style={sizeInfoPos} />}

      {/* 放大镜 - 仅在选区绘制完成前显示 */}
      {isReady && !selection && magPos && bgRef.current && (
        <Magnifier
          bgCanvas={bgRef.current}
          mousePos={mousePos}
          pixelColor={pixelColor}
          scaleFactor={scaleFactor}
          style={magPos}
        />
      )}

      {/* 工具栏 */}
      {selection && selection.w > 10 && selection.h > 10 && toolbarPos && !isDrawing && (
        <Toolbar
          activeTool={activeToolType}
          strokeColor={drawingConfig.strokeColor}
          strokeWidth={drawingConfig.strokeWidth}
          canUndo={canUndo()}
          canRedo={canRedo()}
          onSelectTool={(type) => setActiveTool(activeToolType === type ? null : type)}
          onColorChange={store.setStrokeColor}
          onStrokeWidthChange={store.setStrokeWidth}
          onUndo={undo}
          onRedo={redo}
          onConfirm={handleConfirm}
          onDownload={handleDownload}
          onCancel={handleCancel}
          style={toolbarPos}
        />
      )}

      {/* 文字输入 */}
      {textInput && (
        <TextInputOverlay
          pos={textInput.pos}
          config={textInput.config}
          scaleFactor={scaleFactor}
          onComplete={completeTextInput}
          onCancel={() => setTextInput(null)}
        />
      )}

      {/* Loading */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* 快捷键提示 */}
      {isReady && (
        <div className="absolute top-3 right-3 flex gap-2 pointer-events-none z-30">
          <span className="px-2 py-1 bg-black/60 text-white text-xs rounded">ESC 取消</span>
          {selection && (
            <span className="px-2 py-1 bg-black/60 text-white text-xs rounded">Enter 确认</span>
          )}
        </div>
      )}
    </div>
  );
}
