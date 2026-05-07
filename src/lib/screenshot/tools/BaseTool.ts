import type { Point, Shape, ToolState, ToolType } from '../types';

/**
 * 工具基础接口
 */
export interface BaseTool {
  readonly type: ToolType;

  /** 工具激活时调用 */
  onActivate(): void;
  /** 工具停用时调用 */
  onDeactivate(): void;

  /** 鼠标按下 - 物理像素坐标 */
  onMouseDown(pos: Point, state: ToolState): void;
  /** 鼠标移动 */
  onMouseMove(pos: Point, state: ToolState): void;
  /** 鼠标抬起 - 返回完成的 Shape，无效则返回 null */
  onMouseUp(pos: Point, state: ToolState): Shape | null;

  /** 渲染当前临时 Shape（绘制中） */
  renderTemp(ctx: CanvasRenderingContext2D): void;

  /** 渲染已完成的 Shape */
  renderShape(ctx: CanvasRenderingContext2D, shape: Shape, bgCanvas?: HTMLCanvasElement): void;

  /** 获取光标样式 */
  getCursor(): string;

  /** 获取临时 Shape（可为 null） */
  getTempShape(): Shape | null;
}

/** 生成唯一 Shape ID */
export function genShapeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
