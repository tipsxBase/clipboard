/**
 * React Hook for Screenshot Window
 *
 * Handles screenshot window state management, canvas rendering,
 * selection operations, and Tauri event coordination.
 *
 * Based on Vue ScreenshotWindow.vue with React patterns:
 * - useRef for canvas refs and mutable state
 * - useState for reactive UI state
 * - useCallback for event handlers
 * - useEffect for lifecycle and cleanup
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

import type { CaptureResult, AppConfig } from '../types';
import { useFabricCanvas, type DrawingToolType } from './useFabricCanvas';
import { ShapeRegistry } from '../composables/shapes';

// Selection rectangle in physical pixels
interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Pixel color under cursor
interface PixelColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

// Scale factor for coordinate conversion
interface ScaleFactor {
  x: number;
  y: number;
}

export function useScreenshotWindow() {
  // ==================== Canvas Refs ====================
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionCanvasElRef = useRef<HTMLCanvasElement | null>(null);

  // ==================== State ====================
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);

  // Interaction state - refs for performance (no re-renders during pointer movement)
  const isSelectingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const resizeHandleRef = useRef<string | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragStartSelectionRef = useRef<SelectionRect | null>(null);
  // Current selection ref for drawing (avoids state updates during drag)
  const currentSelectionRef = useRef<SelectionRect | null>(null);

  // Mouse position - refs for performance
  const mousePosRef = useRef({ x: 0, y: 0 });
  const canvasMousePosRef = useRef({ x: 0, y: 0 });
  // Pixel color - ref to avoid re-renders on every mousemove
  const pixelColorRef = useRef<PixelColor>({
    r: 0,
    g: 0,
    b: 0,
    hex: '#000000',
  });

  // Scale factor
  const scaleFactorRef = useRef<ScaleFactor>({ x: 1, y: 1 });

  // Current screen ID
  const currentScreenIdRef = useRef<number | null>(null);

  // Current capture data (for immediate access)
  const captureRef = useRef<CaptureResult | null>(null);

  // Screenshot export preferences
  const screenshotFormatRef = useRef<'png' | 'jpeg' | 'webp'>('png');
  const screenshotQualityRef = useRef(90);
  const screenshotSaveActionRef = useRef<'clipboard' | 'file' | 'both'>('clipboard');

  // Cursor style
  const [cursorStyle, setCursorStyle] = useState('crosshair');

  // Pending fabric canvas render (to handle async state update)
  const pendingFabricRenderRef = useRef<SelectionRect | null>(null);

  // ==================== Fabric Canvas ====================
  const fabricCanvasHook = useFabricCanvas({
    strokeColor: '#ff0000',
    strokeWidth: 3,
    fillColor: 'transparent',
  });

  // ==================== Computed Bounds ====================
  const bounds = useCallback(() => {
    if (captures.length > 0) {
      const c = captures[0];
      return { x: 0, y: 0, w: c.width, h: c.height };
    }
    return {
      x: 0,
      y: 0,
      w: window.innerWidth * window.devicePixelRatio,
      h: window.innerHeight * window.devicePixelRatio,
    };
  }, [captures]);

  // ==================== Coordinate Conversion ====================
  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    return {
      x: clientX * scaleFactorRef.current.x,
      y: clientY * scaleFactorRef.current.y,
    };
  }, []);

  // ==================== Pixel Color ====================
  const updatePixelColor = useCallback((x: number, y: number) => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];
      const hex =
        `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
      // Update ref instead of state to avoid re-renders
      pixelColorRef.current = { r, g, b, hex };
    } catch {
      // Ignore errors
    }
  }, []);

  // ==================== Magnifier ====================
  const updateMagnifier = useCallback((x: number, y: number, hasSelection: boolean) => {
    const magCanvas = magnifierCanvasRef.current;
    const bgCvs = bgCanvasRef.current;
    if (!magCanvas || !bgCvs || hasSelection) return;

    const ctx = magCanvas.getContext('2d');
    const bgCtx = bgCvs.getContext('2d', { willReadFrequently: true });
    if (!ctx || !bgCtx) return;

    const magSize = 120;
    const zoomLevel = 4;
    const sourceSize = magSize / zoomLevel;

    magCanvas.width = magSize;
    magCanvas.height = magSize;

    ctx.imageSmoothingEnabled = false;

    // Draw zoomed area
    ctx.drawImage(
      bgCvs,
      x - sourceSize / 2,
      y - sourceSize / 2,
      sourceSize,
      sourceSize,
      0,
      0,
      magSize,
      magSize
    );

    // Draw crosshair
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(magSize / 2, 0);
    ctx.lineTo(magSize / 2, magSize);
    ctx.moveTo(0, magSize / 2);
    ctx.lineTo(magSize, magSize / 2);
    ctx.stroke();

    // Draw border
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, magSize, magSize);
  }, []);

  // ==================== Background Rendering ====================
  const loadImage = useCallback((src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  // Direct rendering using capture data (bypasses state dependency)
  const renderBackgroundDirect = useCallback(
    async (capture: CaptureResult) => {
      const canvas = bgCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const w = capture.width;
      const h = capture.height;

      canvas.width = w;
      canvas.height = h;

      // Calculate scale factor after canvas is sized
      const rect = canvas.getBoundingClientRect();
      scaleFactorRef.current = {
        x: w / rect.width,
        y: h / rect.height,
      };

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const img = await loadImage(convertFileSrc(capture.path));
        ctx.drawImage(img, 0, 0, capture.width, capture.height);
      } catch (e) {
        console.error('Error loading screenshot:', capture.path, e);
      }

      // Setup mask canvas with initial mask overlay
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = w;
        maskCanvasRef.current.height = h;
        const maskCtx = maskCanvasRef.current.getContext('2d');
        if (maskCtx) {
          // Draw initial semi-transparent overlay
          maskCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          maskCtx.fillRect(0, 0, w, h);
        }
      }
    },
    [loadImage]
  );

  // ==================== Mask Rendering ====================
  const renderMask = useCallback((sel: SelectionRect | null) => {
    const cvs = maskCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    // Always draw semi-transparent overlay (even without selection)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    if (sel && sel.w > 0 && sel.h > 0) {
      const { x, y, w, h } = sel;

      // Clear selection area
      ctx.clearRect(x, y, w, h);
      // Draw border
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Draw resize handles
      const handleSize = 8;
      ctx.fillStyle = '#00e676';

      const handles = [
        { x: x - handleSize / 2, y: y - handleSize / 2 }, // nw
        { x: x + w / 2 - handleSize / 2, y: y - handleSize / 2 }, // n
        { x: x + w - handleSize / 2, y: y - handleSize / 2 }, // ne
        { x: x - handleSize / 2, y: y + h / 2 - handleSize / 2 }, // w
        { x: x + w - handleSize / 2, y: y + h / 2 - handleSize / 2 }, // e
        { x: x - handleSize / 2, y: y + h - handleSize / 2 }, // sw
        { x: x + w / 2 - handleSize / 2, y: y + h - handleSize / 2 }, // s
        { x: x + w - handleSize / 2, y: y + h - handleSize / 2 }, // se
      ];

      handles.forEach((handle) => {
        ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
      });

      // Draw rule-of-thirds guide lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(x + w / 3, y);
      ctx.lineTo(x + w / 3, y + h);
      ctx.moveTo(x + (w * 2) / 3, y);
      ctx.lineTo(x + (w * 2) / 3, y + h);
      ctx.moveTo(x, y + h / 3);
      ctx.lineTo(x + w, y + h / 3);
      ctx.moveTo(x, y + (h * 2) / 3);
      ctx.lineTo(x + w, y + (h * 2) / 3);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, []);

  // ==================== Resize Handle Detection ====================
  const getResizeHandle = useCallback(
    (x: number, y: number, sel: SelectionRect | null): string | null => {
      if (!sel) return null;
      const { x: sx, y: sy, w, h } = sel;
      const threshold = 12;

      // Corners
      if (Math.abs(x - sx) < threshold && Math.abs(y - sy) < threshold) return 'nw';
      if (Math.abs(x - (sx + w)) < threshold && Math.abs(y - sy) < threshold) return 'ne';
      if (Math.abs(x - sx) < threshold && Math.abs(y - (sy + h)) < threshold) return 'sw';
      if (Math.abs(x - (sx + w)) < threshold && Math.abs(y - (sy + h)) < threshold) return 'se';

      // Edges
      if (Math.abs(x - sx) < threshold && y > sy && y < sy + h) return 'w';
      if (Math.abs(x - (sx + w)) < threshold && y > sy && y < sy + h) return 'e';
      if (Math.abs(y - sy) < threshold && x > sx && x < sx + w) return 'n';
      if (Math.abs(y - (sy + h)) < threshold && x > sx && x < sx + w) return 's';

      return null;
    },
    []
  );

  const isInsideSelection = useCallback(
    (x: number, y: number, sel: SelectionRect | null): boolean => {
      if (!sel) return false;
      const { x: sx, y: sy, w, h } = sel;
      return x > sx && x < sx + w && y > sy && y < sy + h;
    },
    []
  );

  // ==================== Cursor Update ====================
  // Use ref for cursor to avoid re-renders during mousemove
  const cursorStyleRef = useRef('crosshair');
  const lastCursorRef = useRef('');

  const updateCursor = useCallback(
    (x: number, y: number, sel: SelectionRect | null, activeTool: DrawingToolType) => {
      let newCursor = 'crosshair';

      if (!isReady) {
        newCursor = 'wait';
      } else if (!sel) {
        newCursor = 'crosshair';
      } else if (activeTool) {
        newCursor = 'crosshair';
      } else {
        const handle = getResizeHandle(x, y, sel);
        if (handle) {
          const cursors: Record<string, string> = {
            nw: 'nw-resize',
            ne: 'ne-resize',
            sw: 'sw-resize',
            se: 'se-resize',
            n: 'n-resize',
            s: 's-resize',
            w: 'w-resize',
            e: 'e-resize',
          };
          newCursor = cursors[handle] || 'crosshair';
        } else {
          const inside = isInsideSelection(x, y, sel);
          if (inside) {
            const hasObjects =
              (fabricCanvasHook.fabricCanvas.current?.getObjects().length ?? 0) > 0;
            newCursor = hasObjects ? 'crosshair' : 'move';
          }
        }
      }

      // Only update state if cursor changed (avoid unnecessary re-renders)
      if (newCursor !== lastCursorRef.current) {
        lastCursorRef.current = newCursor;
        cursorStyleRef.current = newCursor;
        setCursorStyle(newCursor);
      }
    },
    [isReady, getResizeHandle, isInsideSelection, fabricCanvasHook.fabricCanvas]
  );

  // ==================== Selection Canvas ====================
  const renderSelectionCanvas = useCallback(
    async (sel: SelectionRect) => {
      const bgCvs = bgCanvasRef.current;
      if (!bgCvs || !sel) return;

      const { x, y, w, h } = sel;
      const canvasEl = selectionCanvasElRef.current;
      if (!canvasEl) return;

      // Create temporary canvas to get selection image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.drawImage(bgCvs, x, y, w, h, 0, 0, w, h);

      // Set background canvas for blur/mosaic tools (use full screenshot, not temp canvas)
      // This ensures pixel reading always gets original pixels, not processed ones
      ShapeRegistry.setBackgroundCanvas(bgCvs);
      ShapeRegistry.setSelectionOffset({ x, y });

      // Calculate CSS dimensions (logical pixels)
      const cssWidth = w / scaleFactorRef.current.x;
      const cssHeight = h / scaleFactorRef.current.y;

      // Initialize Fabric Canvas
      fabricCanvasHook.initCanvas(canvasEl, w, h, cssWidth, cssHeight);

      // Set background image
      await fabricCanvasHook.setBackgroundImage(tempCanvas.toDataURL());

      // Reset history
      fabricCanvasHook.resetHistory();
      fabricCanvasHook.saveHistory();
    },
    [fabricCanvasHook]
  );

  // ==================== Mouse Handlers ====================
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Ignore toolbar and button clicks
      if (target.closest('.toolbar') || target.closest('button')) {
        return;
      }

      // If click is on Fabric canvas upper layer, let Fabric handle it
      if (target.classList.contains('upper-canvas')) {
        return;
      }

      const pos = toCanvasCoords(e.clientX, e.clientY);
      const currentSel = currentSelectionRef.current;

      if (currentSel) {
        // Already has selection
        if (isInsideSelection(pos.x, pos.y, currentSel)) {
          // Click inside selection - let Fabric handle
          return;
        }

        // Click outside selection - check resize handles
        const hasObjects = (fabricCanvasHook.fabricCanvas.current?.getObjects().length ?? 0) > 0;
        if (!hasObjects) {
          const handle = getResizeHandle(pos.x, pos.y, currentSel);
          if (handle) {
            isResizingRef.current = true;
            resizeHandleRef.current = handle;
            dragStartPosRef.current = pos;
            dragStartSelectionRef.current = { ...currentSel };
            return;
          }
        }

        // Click outside selection with existing selection - ignore
        return;
      }

      // No selection - start new selection
      isSelectingRef.current = true;
      // Notify other windows
      emit('selection-started', { id: currentScreenIdRef.current });
      startPosRef.current = pos;
      // Initialize selection ref (don't update state yet)
      currentSelectionRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
      renderMask(currentSelectionRef.current);
    },
    [toCanvasCoords, isInsideSelection, getResizeHandle, fabricCanvasHook.fabricCanvas, renderMask]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const pos = toCanvasCoords(e.clientX, e.clientY);
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      canvasMousePosRef.current = pos;

      // Update cursor
      updateCursor(pos.x, pos.y, currentSelectionRef.current, fabricCanvasHook.activeTool);

      // Update pixel color and magnifier
      updatePixelColor(pos.x, pos.y);
      updateMagnifier(pos.x, pos.y, currentSelectionRef.current !== null);

      if (isSelectingRef.current) {
        const x = Math.min(startPosRef.current.x, pos.x);
        const y = Math.min(startPosRef.current.y, pos.y);
        const w = Math.abs(pos.x - startPosRef.current.x);
        const h = Math.abs(pos.y - startPosRef.current.y);
        const newSel = { x, y, w, h };
        // Update ref only (avoid state updates during drag)
        currentSelectionRef.current = newSel;
        renderMask(newSel);
        return;
      }

      if (isDraggingRef.current && dragStartSelectionRef.current) {
        const hasObjects = (fabricCanvasHook.fabricCanvas.current?.getObjects().length ?? 0) > 0;
        if (hasObjects) return;

        const dx = pos.x - dragStartPosRef.current.x;
        const dy = pos.y - dragStartPosRef.current.y;
        const b = bounds();
        let newX = dragStartSelectionRef.current.x + dx;
        let newY = dragStartSelectionRef.current.y + dy;

        newX = Math.max(0, Math.min(b.w - dragStartSelectionRef.current.w, newX));
        newY = Math.max(0, Math.min(b.h - dragStartSelectionRef.current.h, newY));

        const newSel = {
          x: newX,
          y: newY,
          w: dragStartSelectionRef.current.w,
          h: dragStartSelectionRef.current.h,
        };
        currentSelectionRef.current = newSel;
        renderMask(newSel);
        return;
      }

      if (isResizingRef.current && dragStartSelectionRef.current && resizeHandleRef.current) {
        const hasObjects = (fabricCanvasHook.fabricCanvas.current?.getObjects().length ?? 0) > 0;
        if (hasObjects) return;

        const { x: sx, y: sy, w: sw, h: sh } = dragStartSelectionRef.current;
        const dx = pos.x - dragStartPosRef.current.x;
        const dy = pos.y - dragStartPosRef.current.y;

        let newX = sx,
          newY = sy,
          newW = sw,
          newH = sh;

        switch (resizeHandleRef.current) {
          case 'nw':
            newX = sx + dx;
            newY = sy + dy;
            newW = sw - dx;
            newH = sh - dy;
            break;
          case 'ne':
            newY = sy + dy;
            newW = sw + dx;
            newH = sh - dy;
            break;
          case 'sw':
            newX = sx + dx;
            newW = sw - dx;
            newH = sh + dy;
            break;
          case 'se':
            newW = sw + dx;
            newH = sh + dy;
            break;
          case 'n':
            newY = sy + dy;
            newH = sh - dy;
            break;
          case 's':
            newH = sh + dy;
            break;
          case 'w':
            newX = sx + dx;
            newW = sw - dx;
            break;
          case 'e':
            newW = sw + dx;
            break;
        }

        if (newW < 0) {
          newX = newX + newW;
          newW = -newW;
        }
        if (newH < 0) {
          newY = newY + newH;
          newH = -newH;
        }

        const b = bounds();
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.min(b.w - newX, newW);
        newH = Math.min(b.h - newY, newH);

        const newSel = { x: newX, y: newY, w: newW, h: newH };
        currentSelectionRef.current = newSel;
        renderMask(newSel);
      }
    },
    [
      toCanvasCoords,
      updateCursor,
      updatePixelColor,
      updateMagnifier,
      renderMask,
      bounds,
      fabricCanvasHook.fabricCanvas,
      fabricCanvasHook.activeTool,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (isSelectingRef.current) {
      isSelectingRef.current = false;

      const currentSel = currentSelectionRef.current;
      // Small selection (< 10px) -> fullscreen
      if (currentSel && (currentSel.w < 10 || currentSel.h < 10)) {
        const b = bounds();
        const fullSel = { x: 0, y: 0, w: b.w, h: b.h };
        currentSelectionRef.current = fullSel;
        setSelection(fullSel);
        renderMask(fullSel);
        // Mark pending fabric canvas render (will be handled by useEffect)
        pendingFabricRenderRef.current = fullSel;
      } else if (currentSel) {
        setSelection(currentSel);
        // Mark pending fabric canvas render
        pendingFabricRenderRef.current = currentSel;
      }
    }

    isDraggingRef.current = false;
    isResizingRef.current = false;
    resizeHandleRef.current = null;
    dragStartSelectionRef.current = null;
  }, [renderMask, bounds]);

  const handleDoubleClick = useCallback(
    async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.closest('.toolbar') || target.closest('button')) return;

      // If Fabric has active object or clicked on object, let Fabric handle
      if (fabricCanvasHook.fabricCanvas.current) {
        if (fabricCanvasHook.fabricCanvas.current.getActiveObject()) return;

        const targetObj = fabricCanvasHook.fabricCanvas.current.findTarget(e as unknown as any);
        if (targetObj) return;
      }

      const currentSel = selection;
      // If has valid selection, confirm immediately
      if (currentSel && currentSel.w > 0 && currentSel.h > 0) {
        await confirmSelection();
        return;
      }

      // No selection - select fullscreen
      const b = bounds();
      const fullSel = { x: 0, y: 0, w: b.w, h: b.h };
      currentSelectionRef.current = fullSel;
      setSelection(fullSel);
      renderMask(fullSel);
      await renderSelectionCanvas(fullSel);
    },
    [fabricCanvasHook.fabricCanvas, bounds, renderMask, renderSelectionCanvas]
  );

  // ==================== Selection Operations ====================
  const resetSelection = useCallback(() => {
    currentSelectionRef.current = null;
    setSelection(null);
    isSelectingRef.current = false;
    isDraggingRef.current = false;
    isResizingRef.current = false;
    resizeHandleRef.current = null;
    fabricCanvasHook.setActiveTool(null);
    fabricCanvasHook.dispose();
    renderMask(null);
  }, [fabricCanvasHook, renderMask]);

  const confirmSelection = useCallback(async () => {
    const currentSel = currentSelectionRef.current;
    if (!currentSel || !fabricCanvasHook.fabricCanvas.current) return;

    const fmt = screenshotFormatRef.current;
    const qual = screenshotQualityRef.current;
    const action = screenshotSaveActionRef.current;

    const canvasFmt = fmt === 'jpeg' ? 'jpeg' : 'png';
    const base64data = fabricCanvasHook.toDataURL(canvasFmt, fmt === 'jpeg' ? qual / 100 : 1);
    if (!base64data) return;

    try {
      if (action === 'clipboard' || action === 'both') {
        const savedPath = await invoke('save_captured_image', {
          base64Data: base64data,
          format: fmt,
          quality: qual,
        });
        await invoke('set_clipboard_item', {
          content: savedPath as string,
          kind: 'image',
          id: null,
          htmlContent: null,
          screenshotId: null,
        });
      }

      if (action === 'file' || action === 'both') {
        if (action === 'file') {
          const savedPath = await invoke('save_captured_image', {
            base64Data: base64data,
            format: fmt,
            quality: qual,
          });
          await invoke('add_to_history', {
            content: savedPath as string,
            kind: 'image',
          });
        }
      }

      close();
    } catch (e) {
      console.error(e);
    }
  }, [selection, fabricCanvasHook]);

  const downloadScreenshot = useCallback(() => {
    const currentSel = selection;
    if (!currentSel || !fabricCanvasHook.fabricCanvas.current) return;

    const fmt = screenshotFormatRef.current;
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    const canvasFmt = fmt === 'jpeg' ? 'jpeg' : 'png';
    const qual = fmt === 'jpeg' ? screenshotQualityRef.current / 100 : 1;

    const link = document.createElement('a');
    link.download = `screenshot_${Date.now()}.${ext}`;
    link.href = fabricCanvasHook.toDataURL(canvasFmt, qual);
    link.click();
  }, [selection, fabricCanvasHook]);

  const close = useCallback(async () => {
    setIsReady(false);
    setSelection(null);
    setCaptures([]);
    fabricCanvasHook.setActiveTool(null);
    fabricCanvasHook.dispose();
    await invoke('close_capture');
  }, [fabricCanvasHook]);

  // ==================== Toolbar Position ====================
  const toolbarPosition = useCallback(() => {
    const currentSel = selection;
    if (!currentSel) return null;

    const logicalX = currentSel.x / scaleFactorRef.current.x;
    const logicalY = currentSel.y / scaleFactorRef.current.y;
    const logicalW = currentSel.w / scaleFactorRef.current.x;
    const logicalH = currentSel.h / scaleFactorRef.current.y;

    const toolbarWidth = 520;
    const toolbarHeight = 40;
    const margin = 8;

    let left = logicalX + logicalW - toolbarWidth;
    if (left < margin) left = logicalX;
    if (left < margin) left = margin;
    if (left + toolbarWidth > window.innerWidth - margin) {
      left = window.innerWidth - toolbarWidth - margin;
    }

    let top: number;
    const spaceBelow = window.innerHeight - (logicalY + logicalH);
    const spaceAbove = logicalY;

    if (spaceBelow >= toolbarHeight + margin * 2) {
      top = logicalY + logicalH + margin;
    } else if (spaceAbove >= toolbarHeight + margin * 2) {
      top = logicalY - toolbarHeight - margin;
    } else {
      top = logicalY + logicalH - toolbarHeight - margin;
    }

    top = Math.max(margin, Math.min(window.innerHeight - toolbarHeight - margin, top));

    return { left, top };
  }, [selection]);

  // ==================== Size Info Position ====================
  const sizeInfoPosition = useCallback(() => {
    const currentSel = selection;
    if (!currentSel) return null;

    const logicalX = currentSel.x / scaleFactorRef.current.x;
    const logicalY = currentSel.y / scaleFactorRef.current.y;

    let top = logicalY - 28;
    if (top < 8) top = logicalY + 8;

    return { left: logicalX, top };
  }, [selection]);

  // ==================== Magnifier Position ====================
  const magnifierPosition = useCallback(() => {
    if (selection) return null;

    const x = mousePosRef.current.x;
    const y = mousePosRef.current.y;
    const magSize = 140;
    const offset = 20;

    let left = x + offset;
    let top = y + offset;

    if (left + magSize > window.innerWidth) left = x - magSize - offset;
    if (top + magSize > window.innerHeight) top = y - magSize - offset;

    return { left, top };
  }, [selection]);

  // ==================== Selection Canvas Wrapper Position ====================
  const selectionCanvasWrapperPosition = useCallback(() => {
    const currentSel = selection;
    if (!currentSel) return null;

    const cssWidth = currentSel.w / scaleFactorRef.current.x;
    const cssHeight = currentSel.h / scaleFactorRef.current.y;

    return {
      left: currentSel.x / scaleFactorRef.current.x,
      top: currentSel.y / scaleFactorRef.current.y,
      width: cssWidth,
      height: cssHeight,
    };
  }, [selection]);

  // ==================== Selection Size ====================
  const selectionSize = useCallback(() => {
    const currentSel = selection;
    if (!currentSel) return '';
    return `${Math.round(currentSel.w)} × ${Math.round(currentSel.h)}`;
  }, [selection]);

  // ==================== Coordinate Display ====================
  const coordDisplay = useCallback(() => {
    return `(${Math.round(canvasMousePosRef.current.x)}, ${Math.round(canvasMousePosRef.current.y)})`;
  }, []);

  // ==================== Lifecycle ====================
  useEffect(() => {
    let unlistenCapture: UnlistenFn | null = null;
    let unlistenSelection: UnlistenFn | null = null;
    let mounted = true;

    // Define handlers INSIDE useEffect to break dependency chain
    const handleKeyDownInner = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' && currentSelectionRef.current) {
        e.preventDefault();
        confirmSelection();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (fabricCanvasHook.canRedo()) fabricCanvasHook.redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (fabricCanvasHook.canUndo()) fabricCanvasHook.undo();
      }
    };

    const handleGlobalMouseMoveInner = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      const pos = toCanvasCoords(e.clientX, e.clientY);
      canvasMousePosRef.current = pos;
      updatePixelColor(pos.x, pos.y);
      updateMagnifier(pos.x, pos.y, currentSelectionRef.current !== null);
    };

    const setup = async () => {
      // Add event listeners
      document.addEventListener('keydown', handleKeyDownInner);
      document.addEventListener('mousemove', handleGlobalMouseMoveInner);

      // Load screenshot config
      try {
        const cfg = await invoke<AppConfig>('get_config');
        if (!mounted) return;
        screenshotFormatRef.current = (cfg.screenshot_format as 'png' | 'jpeg' | 'webp') || 'png';
        screenshotQualityRef.current = cfg.screenshot_quality ?? 90;
        screenshotSaveActionRef.current =
          (cfg.screenshot_save_action as 'clipboard' | 'file' | 'both') || 'clipboard';
      } catch (e) {
        console.error('Failed to load screenshot config:', e);
      }

      // Parse screen_id from URL
      const urlParams = new URLSearchParams(window.location.search);
      const screenIdParam = urlParams.get('screen_id');
      currentScreenIdRef.current = screenIdParam ? parseInt(screenIdParam, 10) : null;

      // Listen for selection start in other windows
      try {
        unlistenSelection = await listen('selection-started', (event: any) => {
          if (event.payload.id !== currentScreenIdRef.current) {
            resetSelection();
          }
        });
        if (!mounted) {
          unlistenSelection();
          unlistenSelection = null;
          return;
        }
      } catch (e) {
        console.error('Failed to listen selection-started:', e);
      }

      // Process captures
      const processCaptures = async (allCaptures: CaptureResult[]) => {
        const sId = currentScreenIdRef.current;
        let targetCapture: CaptureResult | undefined;

        if (sId !== null) {
          targetCapture = allCaptures.find((c) => c.id === sId);
        } else {
          console.warn('No screen_id provided, defaulting to first capture.');
          targetCapture = allCaptures[0];
        }

        if (targetCapture) {
          // Store capture in ref for immediate access
          captureRef.current = targetCapture;
          setCaptures([targetCapture]);
          // Render background directly using capture data (not dependent on state)
          await renderBackgroundDirect(targetCapture);
          if (!mounted) return;
          resetSelection();
          setIsReady(true);
          getCurrentWindow().setFocus();
        } else {
          console.error('Could not find capture for ID:', sId);
        }
      };

      // Listen for screenshot capture event
      try {
        unlistenCapture = await listen<CaptureResult[]>('screenshot-captured', async (event) => {
          if (!mounted) return;
          await processCaptures(event.payload);
        });
        if (!mounted) {
          unlistenCapture();
          unlistenCapture = null;
          return;
        }
      } catch (e) {
        console.error('Failed to listen screenshot-captured:', e);
      }

      // Try to fetch data immediately
      try {
        const data = await invoke<CaptureResult[]>('get_capture_data');
        if (!mounted) return;
        await processCaptures(data);
      } catch (e) {
        // No initial capture data found, waiting for event
      }
    };

    setup();

    return () => {
      mounted = false;
      document.removeEventListener('keydown', handleKeyDownInner);
      document.removeEventListener('mousemove', handleGlobalMouseMoveInner);
      try {
        if (unlistenCapture) unlistenCapture();
      } catch (e) {
        // Ignore cleanup errors
      }
      try {
        if (unlistenSelection) unlistenSelection();
      } catch (e) {
        // Ignore cleanup errors
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - handlers defined inside, refs used for mutable state

  // ==================== Fabric Canvas Render after Selection ====================
  useEffect(() => {
    const pendingSel = pendingFabricRenderRef.current;
    console.log('[useScreenshotWindow] Fabric render effect:', {
      pendingSel,
      selection,
      canvasEl: selectionCanvasElRef.current,
    });
    if (pendingSel && selection && selectionCanvasElRef.current) {
      pendingFabricRenderRef.current = null;
      console.log('[useScreenshotWindow] Calling renderSelectionCanvas');
      renderSelectionCanvas(pendingSel);
    }
  }, [selection, renderSelectionCanvas]);

  // ==================== Return Interface ====================
  return {
    // State
    isReady,
    selection,
    pixelColor: pixelColorRef.current,
    cursorStyle,

    // Canvas refs
    bgCanvasRef,
    maskCanvasRef,
    magnifierCanvasRef,
    selectionCanvasElRef,

    // Fabric canvas hook
    fabricCanvasHook,

    // Mouse handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,

    // Selection operations
    resetSelection,
    confirmSelection,
    downloadScreenshot,
    close,

    // Position helpers
    toolbarPosition,
    sizeInfoPosition,
    magnifierPosition,
    selectionCanvasWrapperPosition,

    // Display helpers
    selectionSize,
    coordDisplay,
  };
}

export type UseScreenshotWindowReturn = ReturnType<typeof useScreenshotWindow>;
