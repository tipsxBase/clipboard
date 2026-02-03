/**
 * 可扩展图形架构
 *
 * 设计原则：
 * 1. 所有图形都基于 Path 绘制，统一选择行为
 * 2. 每种图形定义自己的控制点类型和位置
 * 3. 控制点可以拖动来调整图形
 * 4. 新增图形只需实现 ShapeHandler 接口
 *
 * 架构：
 * - ShapeData: 图形的抽象数据（端点、尺寸等）
 * - ControlPointDef: 控制点定义（位置、行为）
 * - ShapeHandler: 图形处理器接口（创建、更新、获取控制点）
 * - ShapeRegistry: 图形注册表，管理所有图形类型
 */

import { Circle, FabricObject } from "fabric";

// ============================================================================
// 基础类型定义
// ============================================================================

/** 点坐标 */
export interface Point2D {
  x: number;
  y: number;
}

/** 图形数据基类 - 所有图形数据都继承此接口 */
export interface BaseShapeData {
  type: ShapeType;
}

/** 矩形数据 */
export interface RectShapeData extends BaseShapeData {
  type: "rect";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 椭圆数据 */
export interface EllipseShapeData extends BaseShapeData {
  type: "ellipse";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 箭头数据 */
export interface ArrowShapeData extends BaseShapeData {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 自由画笔数据 */
export interface PenShapeData extends BaseShapeData {
  type: "pen";
  points: Point2D[];
}

/** 文本数据 */
export interface TextShapeData extends BaseShapeData {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

/** 所有图形数据的联合类型 */
export type ShapeData =
  | RectShapeData
  | EllipseShapeData
  | ArrowShapeData
  | PenShapeData
  | TextShapeData;

/** 图形类型 */
export type ShapeType = "rect" | "ellipse" | "arrow" | "pen" | "text";

// ============================================================================
// 控制点定义
// ============================================================================

/** 控制点 ID */
export type ControlPointId = string;

/** 控制点定义 */
export interface ControlPointDef {
  id: ControlPointId;
  /** 获取控制点位置 */
  getPosition: (data: ShapeData) => Point2D;
  /** 控制点被拖动时更新图形数据 */
  onDrag: (data: ShapeData, newPos: Point2D) => ShapeData;
  /** 控制点样式 */
  style?: {
    radius?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };
}

// ============================================================================
// 图形处理器接口
// ============================================================================

/** 绘图配置 */
export interface DrawingConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

/** 图形处理器接口 - 每种图形都需要实现 */
export interface ShapeHandler<T extends ShapeData = ShapeData> {
  /** 图形类型 */
  type: ShapeType;

  /** 从起点和当前点创建初始数据（绘制过程中） */
  createData(start: Point2D, current: Point2D, points?: Point2D[]): T | null;

  /** 根据数据创建 Path 对象 */
  createPath(data: T, config: DrawingConfig): FabricObject;

  /** 移动图形 */
  move(data: T, dx: number, dy: number): T;

  /** 获取控制点定义列表 */
  getControlPoints(): ControlPointDef[];

  /** 图形是否需要填充（如箭头需要填充） */
  isFilled?: boolean;
}

// ============================================================================
// 扩展的 Path 类型 - 存储图形数据
// ============================================================================

export interface ShapePath extends FabricObject {
  shapeData?: ShapeData;
  shapeType?: ShapeType;
}

// ============================================================================
// 控制点 Circle 扩展类型
// ============================================================================

export interface ControlCircle extends Circle {
  isControlPoint?: boolean;
  pointId?: ControlPointId;
}

// ============================================================================
// 图形注册表
// ============================================================================

class ShapeRegistryClass {
  private handlers: Map<ShapeType, ShapeHandler> = new Map();

  /** 注册图形处理器 */
  register<T extends ShapeData>(handler: ShapeHandler<T>): void {
    this.handlers.set(handler.type, handler as ShapeHandler);
  }

  /** 获取图形处理器 */
  getHandler(type: ShapeType): ShapeHandler | undefined {
    return this.handlers.get(type);
  }

  /** 获取所有已注册的图形类型 */
  getTypes(): ShapeType[] {
    return Array.from(this.handlers.keys());
  }
}

export const ShapeRegistry = new ShapeRegistryClass();

// ============================================================================
// 初始化所有图形处理器
// ============================================================================

// 注意：在使用 ShapeRegistry 之前，需要先导入这些处理器
// 它们会在导入时自动注册到 ShapeRegistry
