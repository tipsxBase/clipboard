/**
 * 截屏工具类型定义
 * Native Canvas 重写版本
 */

// ============================================================
// 基础几何类型
// ============================================================

export interface Point {
  x: number;
  y: number;
}

export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScaleFactor {
  x: number;
  y: number;
}

export interface PixelColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

// ============================================================
// 工具类型
// ============================================================

export type ToolType = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'blur' | 'mosaic';

export interface DrawingConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fontSize: number;
  fontFamily: string;
}

// ============================================================
// Shape 类型定义
// ============================================================

export interface BaseShape {
  type: ToolType;
  id: string;
}

export interface RectShape extends BaseShape {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

export interface ArrowShape extends BaseShape {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor: string;
  strokeWidth: number;
}

export interface PenShape extends BaseShape {
  type: 'pen';
  points: Point[];
  strokeColor: string;
  strokeWidth: number;
}

export interface TextShape extends BaseShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface BlurShape extends BaseShape {
  type: 'blur';
  x: number;
  y: number;
  w: number;
  h: number;
  /** 已处理好的 ImageData，渲染时直接 putImageData */
  imageData: ImageData | null;
}

export interface MosaicShape extends BaseShape {
  type: 'mosaic';
  x: number;
  y: number;
  w: number;
  h: number;
  blockSize: number;
  /** 已处理好的 ImageData */
  imageData: ImageData | null;
}

export type Shape =
  | RectShape
  | EllipseShape
  | ArrowShape
  | PenShape
  | TextShape
  | BlurShape
  | MosaicShape;

// ============================================================
// 工具状态
// ============================================================

export interface ToolState {
  drawingConfig: DrawingConfig;
  selection: SelectionRect | null;
}

// ============================================================
// Resize 句柄
// ============================================================

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';
