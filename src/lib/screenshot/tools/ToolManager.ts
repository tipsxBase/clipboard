import type { Point, Shape, ToolState, ToolType } from '../types';
import type { BaseTool } from './BaseTool';
import { RectTool } from './RectTool';
import { EllipseTool } from './EllipseTool';
import { ArrowTool } from './ArrowTool';
import { PenTool } from './PenTool';
import { TextTool } from './TextTool';
import { BlurTool } from './BlurTool';
import { MosaicTool } from './MosaicTool';

export class ToolManager {
  private tools = new Map<ToolType, BaseTool>();
  private _activeTool: BaseTool | null = null;

  constructor() {
    this.tools.set('rect', new RectTool());
    this.tools.set('ellipse', new EllipseTool());
    this.tools.set('arrow', new ArrowTool());
    this.tools.set('pen', new PenTool());
    this.tools.set('text', new TextTool());
    this.tools.set('blur', new BlurTool());
    this.tools.set('mosaic', new MosaicTool());
  }

  get activeTool(): BaseTool | null {
    return this._activeTool;
  }

  get activeToolType(): ToolType | null {
    return this._activeTool?.type ?? null;
  }

  setActiveTool(type: ToolType | null): void {
    if (this._activeTool) {
      this._activeTool.onDeactivate();
    }
    this._activeTool = type ? (this.tools.get(type) ?? null) : null;
    if (this._activeTool) {
      this._activeTool.onActivate();
    }
  }

  getTool<T extends BaseTool>(type: ToolType): T | null {
    return (this.tools.get(type) as T | undefined) ?? null;
  }

  getTextTool(): TextTool {
    return this.tools.get('text') as TextTool;
  }

  getBlurTool(): BlurTool {
    return this.tools.get('blur') as BlurTool;
  }

  getMosaicTool(): MosaicTool {
    return this.tools.get('mosaic') as MosaicTool;
  }

  onMouseDown(pos: Point, state: ToolState): void {
    this._activeTool?.onMouseDown(pos, state);
  }

  onMouseMove(pos: Point, state: ToolState): void {
    this._activeTool?.onMouseMove(pos, state);
  }

  /**
   * 鼠标抬起 - 对于 blur/mosaic 需要传入 bgCanvas 进行像素操作
   */
  onMouseUp(pos: Point, state: ToolState, bgCanvas?: HTMLCanvasElement): Shape | null {
    if (!this._activeTool) return null;
    if (this._activeTool.type === 'blur' || this._activeTool.type === 'mosaic') {
      const tool = this._activeTool as BlurTool | MosaicTool;
      return tool.onMouseUp(pos, state, bgCanvas);
    }
    return this._activeTool.onMouseUp(pos, state);
  }

  getCursor(): string {
    return this._activeTool?.getCursor() ?? 'crosshair';
  }

  /** 渲染所有已完成的 Shape */
  renderShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], bgCanvas?: HTMLCanvasElement): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const shape of shapes) {
      const tool = this.tools.get(shape.type);
      if (tool) {
        tool.renderShape(ctx, shape, bgCanvas);
      }
    }
  }

  /** 渲染临时 Shape（绘制中预览） */
  renderTemp(ctx: CanvasRenderingContext2D): void {
    this._activeTool?.renderTemp(ctx);
  }
}

// 重新导出各工具类型，方便外部使用
export type { BlurTool, MosaicTool, TextTool };
