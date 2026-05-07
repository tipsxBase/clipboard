import type { ArrowShape, Point, Shape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

export class ArrowTool implements BaseTool {
  readonly type = 'arrow' as const;
  private tempShape: ArrowShape | null = null;

  onActivate(): void {}
  onDeactivate(): void {
    this.tempShape = null;
  }

  onMouseDown(pos: Point, state: ToolState): void {
    this.tempShape = {
      id: genShapeId(),
      type: 'arrow',
      x1: pos.x,
      y1: pos.y,
      x2: pos.x,
      y2: pos.y,
      strokeColor: state.drawingConfig.strokeColor,
      strokeWidth: state.drawingConfig.strokeWidth,
    };
  }

  onMouseMove(pos: Point, _state: ToolState): void {
    if (!this.tempShape) return;
    this.tempShape = { ...this.tempShape, x2: pos.x, y2: pos.y };
  }

  onMouseUp(_pos: Point, _state: ToolState): Shape | null {
    const shape = this.tempShape;
    this.tempShape = null;
    if (!shape) return null;
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    if (Math.sqrt(dx * dx + dy * dy) < 10) return null;
    return shape;
  }

  renderTemp(ctx: CanvasRenderingContext2D): void {
    if (this.tempShape) this.renderShape(ctx, this.tempShape);
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as ArrowShape;
    const { x1, y1, x2, y2, strokeColor, strokeWidth } = s;
    const headLength = strokeWidth * 4 + 8;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';

    // Draw shaft
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
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
