import { create } from 'zustand';
import type {
  DrawingConfig,
  PixelColor,
  Point,
  ScaleFactor,
  SelectionRect,
  Shape,
  ToolType,
} from '../lib/screenshot/types';
import { CommandQueue, DrawCommand } from '../lib/screenshot/commands';
import { ToolManager } from '../lib/screenshot/tools/ToolManager';
import {
  BackgroundRenderer,
  MaskRenderer,
  AnnotationRenderer,
  MagnifierRenderer,
} from '../lib/screenshot/renderers';
import type { CaptureResult } from '../types';

// ============================================================
// Store 类型定义
// ============================================================

interface ScreenshotStore {
  // ---------- 初始化状态 ----------
  isCapturing: boolean;
  captures: CaptureResult[];
  currentCapture: CaptureResult | null;
  isReady: boolean;

  // ---------- 选区状态 ----------
  selection: SelectionRect | null;
  isSelecting: boolean;

  // ---------- 标注状态 ----------
  activeToolType: ToolType | null;
  shapes: Shape[];
  isDrawing: boolean;

  // ---------- 绘图配置 ----------
  drawingConfig: DrawingConfig;

  // ---------- 导出配置 ----------
  screenshotFormat: 'png' | 'jpeg' | 'webp';
  screenshotQuality: number;
  screenshotSaveAction: 'clipboard' | 'file' | 'both';

  // ---------- 鼠标 / 放大镜 ----------
  mousePos: Point; // 逻辑像素
  pixelColor: PixelColor;

  // ---------- Canvas 引用（不触发 re-render，使用 ref 机制） ----------
  bgCanvas: HTMLCanvasElement | null;
  maskCanvas: HTMLCanvasElement | null;
  annotationCanvas: HTMLCanvasElement | null;
  magnifierCanvas: HTMLCanvasElement | null;

  // ---------- Scale Factor ----------
  scaleFactor: ScaleFactor;

  // ---------- 管理器 / 渲染器（单例） ----------
  toolManager: ToolManager;
  commandQueue: CommandQueue;
  bgRenderer: BackgroundRenderer | null;
  maskRenderer: MaskRenderer | null;
  annotationRenderer: AnnotationRenderer | null;
  magnifierRenderer: MagnifierRenderer | null;

  // ---------- 文字输入弹窗 ----------
  textInput: { pos: Point; config: DrawingConfig } | null;

  // ============================================================
  // Actions
  // ============================================================

  // 初始化
  setCaptures: (captures: CaptureResult[]) => void;
  setCurrentCapture: (capture: CaptureResult | null) => void;
  setIsReady: (ready: boolean) => void;

  // Canvas 引用
  setBgCanvas: (canvas: HTMLCanvasElement) => void;
  setMaskCanvas: (canvas: HTMLCanvasElement) => void;
  setAnnotationCanvas: (canvas: HTMLCanvasElement) => void;
  setMagnifierCanvas: (canvas: HTMLCanvasElement) => void;

  // Scale Factor
  setScaleFactor: (sf: ScaleFactor) => void;

  // 选区
  setSelection: (sel: SelectionRect | null) => void;
  setIsSelecting: (v: boolean) => void;

  // 工具
  setActiveTool: (type: ToolType | null) => void;

  // 形状
  addShape: (shape: Shape) => void;
  setShapes: (shapes: Shape[]) => void;
  updateShape: (id: string, updater: (shape: Shape) => Shape) => void;
  removeShape: (id: string) => void;

  // 历史
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // 绘图配置
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;

  // 导出配置
  setScreenshotFormat: (fmt: 'png' | 'jpeg' | 'webp') => void;
  setScreenshotQuality: (q: number) => void;
  setScreenshotSaveAction: (action: 'clipboard' | 'file' | 'both') => void;

  // 鼠标 / 放大镜
  setMousePos: (pos: Point) => void;
  setPixelColor: (color: PixelColor) => void;

  // 绘制状态
  setIsDrawing: (v: boolean) => void;

  // 文字输入
  setTextInput: (v: { pos: Point; config: DrawingConfig } | null) => void;
  completeTextInput: (text: string) => void;

  // 渲染触发
  rerenderAnnotation: () => void;
  rerenderMask: () => void;

  // 重置
  reset: () => void;
}

// ============================================================
// 默认绘图配置
// ============================================================

const defaultDrawingConfig: DrawingConfig = {
  strokeColor: '#ff0000',
  strokeWidth: 3,
  fillColor: 'transparent',
  fontSize: 16,
  fontFamily: 'sans-serif',
};

// ============================================================
// Store 实现
// ============================================================

export const useScreenshotStore = create<ScreenshotStore>()((set, get) => ({
  // 初始值
  isCapturing: false,
  captures: [],
  currentCapture: null,
  isReady: false,

  selection: null,
  isSelecting: false,

  activeToolType: null,
  shapes: [],
  isDrawing: false,

  drawingConfig: { ...defaultDrawingConfig },

  screenshotFormat: 'png',
  screenshotQuality: 90,
  screenshotSaveAction: 'clipboard',

  mousePos: { x: 0, y: 0 },
  pixelColor: { r: 0, g: 0, b: 0, hex: '#000000' },

  bgCanvas: null,
  maskCanvas: null,
  annotationCanvas: null,
  magnifierCanvas: null,

  scaleFactor: { x: 1, y: 1 },

  toolManager: new ToolManager(),
  commandQueue: new CommandQueue(),
  bgRenderer: null,
  maskRenderer: null,
  annotationRenderer: null,
  magnifierRenderer: null,

  textInput: null,

  // ---------- Actions ----------

  setCaptures: (captures) => set({ captures }),
  setCurrentCapture: (capture) => set({ currentCapture: capture }),
  setIsReady: (ready) => set({ isReady: ready }),

  setBgCanvas: (canvas) => {
    set({ bgCanvas: canvas, bgRenderer: new BackgroundRenderer(canvas) });
  },

  setMaskCanvas: (canvas) => {
    set({ maskCanvas: canvas, maskRenderer: new MaskRenderer(canvas) });
  },

  setAnnotationCanvas: (canvas) => {
    set({ annotationCanvas: canvas, annotationRenderer: new AnnotationRenderer(canvas) });
  },

  setMagnifierCanvas: (canvas) => {
    set({ magnifierCanvas: canvas, magnifierRenderer: new MagnifierRenderer(canvas) });
  },

  setScaleFactor: (sf) => set({ scaleFactor: sf }),

  setSelection: (sel) => set({ selection: sel }),
  setIsSelecting: (v) => set({ isSelecting: v }),

  setActiveTool: (type) => {
    const { toolManager } = get();
    toolManager.setActiveTool(type);
    set({ activeToolType: type });
  },

  addShape: (shape) => {
    const { shapes, commandQueue, annotationRenderer, annotationCanvas, bgCanvas, toolManager } =
      get();
    const command = new DrawCommand(shapes, shape, () => {
      if (annotationRenderer && annotationCanvas) {
        annotationRenderer.renderNow(() => {
          toolManager.renderShapes(annotationRenderer.context, shapes, bgCanvas ?? undefined);
        });
      }
    });
    commandQueue.execute(command);
    set({ shapes: [...shapes] }); // 触发重渲染
  },

  setShapes: (shapes) => set({ shapes }),

  updateShape: (id, updater) =>
    set((s) => ({ shapes: s.shapes.map((sh) => (sh.id === id ? updater(sh) : sh)) })),

  removeShape: (id) => set((s) => ({ shapes: s.shapes.filter((sh) => sh.id !== id) })),

  undo: () => {
    const { commandQueue, shapes, annotationRenderer, annotationCanvas, bgCanvas, toolManager } =
      get();
    if (commandQueue.undo()) {
      if (annotationRenderer && annotationCanvas) {
        toolManager.renderShapes(annotationRenderer.context, shapes, bgCanvas ?? undefined);
      }
      set({ shapes: [...shapes] });
    }
  },

  redo: () => {
    const { commandQueue, shapes, annotationRenderer, annotationCanvas, bgCanvas, toolManager } =
      get();
    if (commandQueue.redo()) {
      if (annotationRenderer && annotationCanvas) {
        toolManager.renderShapes(annotationRenderer.context, shapes, bgCanvas ?? undefined);
      }
      set({ shapes: [...shapes] });
    }
  },

  canUndo: () => get().commandQueue.canUndo(),
  canRedo: () => get().commandQueue.canRedo(),

  setStrokeColor: (color) =>
    set((s) => ({ drawingConfig: { ...s.drawingConfig, strokeColor: color } })),

  setStrokeWidth: (width) =>
    set((s) => ({ drawingConfig: { ...s.drawingConfig, strokeWidth: width } })),

  setScreenshotFormat: (fmt) => set({ screenshotFormat: fmt }),
  setScreenshotQuality: (q) => set({ screenshotQuality: q }),
  setScreenshotSaveAction: (action) => set({ screenshotSaveAction: action }),

  setMousePos: (pos) => set({ mousePos: pos }),
  setPixelColor: (color) => set({ pixelColor: color }),

  setIsDrawing: (v) => set({ isDrawing: v }),

  setTextInput: (v) => set({ textInput: v }),

  completeTextInput: (text) => {
    const { textInput, toolManager, addShape, drawingConfig } = get();
    if (!textInput || !text.trim()) {
      set({ textInput: null });
      return;
    }
    const textTool = toolManager.getTextTool();
    const shape = textTool.completeText(text, textInput.pos, drawingConfig);
    if (shape) {
      addShape(shape);
    }
    set({ textInput: null });
  },

  rerenderAnnotation: () => {
    const { annotationRenderer, annotationCanvas, shapes, toolManager, bgCanvas, isDrawing } =
      get();
    if (!annotationRenderer || !annotationCanvas) return;

    annotationRenderer.scheduleRender(() => {
      toolManager.renderShapes(annotationRenderer.context, shapes, bgCanvas ?? undefined);
      if (isDrawing) {
        toolManager.renderTemp(annotationRenderer.context);
      }
    });
  },

  rerenderMask: () => {
    const { maskRenderer, maskCanvas, selection, isSelecting, scaleFactor } = get();
    if (!maskRenderer || !maskCanvas) return;
    maskRenderer.render(selection, isSelecting, scaleFactor);
  },

  reset: () => {
    const { toolManager, commandQueue } = get();
    toolManager.setActiveTool(null);
    commandQueue.clear();
    set({
      isCapturing: false,
      captures: [],
      currentCapture: null,
      isReady: false,
      selection: null,
      isSelecting: false,
      activeToolType: null,
      shapes: [],
      isDrawing: false,
      drawingConfig: { ...defaultDrawingConfig },
      mousePos: { x: 0, y: 0 },
      pixelColor: { r: 0, g: 0, b: 0, hex: '#000000' },
      textInput: null,
    });
  },
}));
