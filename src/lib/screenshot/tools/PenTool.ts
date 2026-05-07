import type { PenShape, Point, Shape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

export class PenTool implements BaseTool {
  readonly type = 'pen' as const;
  private tempShape: PenShape | null = null;
  private lastPoint: Point | null = null;

  onActivate(): void {}
  onDeactivate(): void {
    this.tempShape = null;
    this.lastPoint = null;
  }

  onMouseDown(pos: Point, state: ToolState): void {
    this.lastPoint = { ...pos };
    this.tempShape = {
      id: genShapeId(),
      type: 'pen',
      points: [{ ...pos }],
      strokeColor: state.drawingConfig.strokeColor,
      strokeWidth: state.drawingConfig.strokeWidth,
    };
  }

  onMouseMove(pos: Point, _state: ToolState): void {
    if (!this.tempShape || !this.lastPoint) return;
    const dx = pos.x - this.lastPoint.x;
    const dy = pos.y - this.lastPoint.y;
    // 采样优化：移动距离大于 2px 才记录
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      this.tempShape = {
        ...this.tempShape,
        points: [...this.tempShape.points, { ...pos }],
      };
      this.lastPoint = { ...pos };
    }
  }

  onMouseUp(_pos: Point, _state: ToolState): Shape | null {
    const shape = this.tempShape;
    this.tempShape = null;
    this.lastPoint = null;
    if (!shape || shape.points.length < 2) return null;
    return shape;
  }

  renderTemp(ctx: CanvasRenderingContext2D): void {
    if (this.tempShape) this.renderShape(ctx, this.tempShape);
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as PenShape;
    if (s.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = s.strokeColor;
    ctx.lineWidth = s.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);

    // 使用贝塞尔曲线平滑路径
    for (let i = 1; i < s.points.length - 1; i++) {
      const midX = (s.points[i].x + s.points[i + 1].x) / 2;
      const midY = (s.points[i].y + s.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, midX, midY);
    }

    // 最后一段
    const last = s.points[s.points.length - 1];
    ctx.lineTo(last.x, last.y);
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
