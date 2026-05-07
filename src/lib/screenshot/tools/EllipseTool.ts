import type { EllipseShape, Point, Shape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

export class EllipseTool implements BaseTool {
  readonly type = 'ellipse' as const;
  private tempShape: EllipseShape | null = null;
  private startPos: Point = { x: 0, y: 0 };

  onActivate(): void {}
  onDeactivate(): void {
    this.tempShape = null;
  }

  onMouseDown(pos: Point, state: ToolState): void {
    this.startPos = { ...pos };
    this.tempShape = {
      id: genShapeId(),
      type: 'ellipse',
      cx: pos.x,
      cy: pos.y,
      rx: 0,
      ry: 0,
      strokeColor: state.drawingConfig.strokeColor,
      strokeWidth: state.drawingConfig.strokeWidth,
      fillColor: state.drawingConfig.fillColor,
    };
  }

  onMouseMove(pos: Point, _state: ToolState): void {
    if (!this.tempShape) return;
    const cx = (pos.x + this.startPos.x) / 2;
    const cy = (pos.y + this.startPos.y) / 2;
    const rx = Math.abs(pos.x - this.startPos.x) / 2;
    const ry = Math.abs(pos.y - this.startPos.y) / 2;
    this.tempShape = { ...this.tempShape, cx, cy, rx, ry };
  }

  onMouseUp(_pos: Point, _state: ToolState): Shape | null {
    const shape = this.tempShape;
    this.tempShape = null;
    if (!shape || shape.rx < 5 || shape.ry < 5) return null;
    return shape;
  }

  renderTemp(ctx: CanvasRenderingContext2D): void {
    if (this.tempShape) this.renderShape(ctx, this.tempShape);
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as EllipseShape;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
    if (s.fillColor && s.fillColor !== 'transparent') {
      ctx.fillStyle = s.fillColor;
      ctx.fill();
    }
    ctx.strokeStyle = s.strokeColor;
    ctx.lineWidth = s.strokeWidth;
    ctx.stroke();
    ctx.restore();
  }

  getCursor(): string {
    return 'crosshair';
  }

  getTempShape(): Shape | null {
    return this.tempShape;
  }
}
