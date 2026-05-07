import type { Point, RectShape, Shape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

export class RectTool implements BaseTool {
  readonly type = 'rect' as const;
  private tempShape: RectShape | null = null;
  private startPos: Point = { x: 0, y: 0 };

  onActivate(): void {}
  onDeactivate(): void {
    this.tempShape = null;
  }

  onMouseDown(pos: Point, state: ToolState): void {
    this.startPos = { ...pos };
    this.tempShape = {
      id: genShapeId(),
      type: 'rect',
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      strokeColor: state.drawingConfig.strokeColor,
      strokeWidth: state.drawingConfig.strokeWidth,
      fillColor: state.drawingConfig.fillColor,
    };
  }

  onMouseMove(pos: Point, _state: ToolState): void {
    if (!this.tempShape) return;
    const x = Math.min(pos.x, this.startPos.x);
    const y = Math.min(pos.y, this.startPos.y);
    const w = Math.abs(pos.x - this.startPos.x);
    const h = Math.abs(pos.y - this.startPos.y);
    this.tempShape = { ...this.tempShape, x, y, w, h };
  }

  onMouseUp(_pos: Point, _state: ToolState): Shape | null {
    const shape = this.tempShape;
    this.tempShape = null;
    if (!shape || shape.w < 5 || shape.h < 5) return null;
    return shape;
  }

  renderTemp(ctx: CanvasRenderingContext2D): void {
    if (this.tempShape) this.renderShape(ctx, this.tempShape);
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as RectShape;
    ctx.save();
    ctx.strokeStyle = s.strokeColor;
    ctx.lineWidth = s.strokeWidth;
    if (s.fillColor && s.fillColor !== 'transparent') {
      ctx.fillStyle = s.fillColor;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.restore();
  }

  getCursor(): string {
    return 'crosshair';
  }

  getTempShape(): Shape | null {
    return this.tempShape;
  }
}
