import type { BlurShape, Point, Shape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

/** Box Blur - 分离式水平+垂直模糊 */
function applyBoxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const tmp = new Uint8ClampedArray(data.length);

  // 水平方向
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.min(Math.max(x + dx, 0), width - 1);
        const idx = (y * width + nx) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        a += data[idx + 3];
        count++;
      }
      const i = (y * width + x) * 4;
      tmp[i] = r / count;
      tmp[i + 1] = g / count;
      tmp[i + 2] = b / count;
      tmp[i + 3] = a / count;
    }
  }

  // 垂直方向
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(Math.max(y + dy, 0), height - 1);
        const idx = (ny * width + x) * 4;
        r += tmp[idx];
        g += tmp[idx + 1];
        b += tmp[idx + 2];
        a += tmp[idx + 3];
        count++;
      }
      const i = (y * width + x) * 4;
      data[i] = r / count;
      data[i + 1] = g / count;
      data[i + 2] = b / count;
      data[i + 3] = a / count;
    }
  }
}

export class BlurTool implements BaseTool {
  readonly type = 'blur' as const;
  private tempRect: { x: number; y: number; w: number; h: number } | null = null;
  private startPos: Point = { x: 0, y: 0 };

  onActivate(): void {}
  onDeactivate(): void {
    this.tempRect = null;
  }

  onMouseDown(pos: Point, _state: ToolState): void {
    this.startPos = { ...pos };
    this.tempRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
  }

  onMouseMove(pos: Point, _state: ToolState): void {
    if (!this.tempRect) return;
    const x = Math.min(pos.x, this.startPos.x);
    const y = Math.min(pos.y, this.startPos.y);
    const w = Math.abs(pos.x - this.startPos.x);
    const h = Math.abs(pos.y - this.startPos.y);
    this.tempRect = { x, y, w, h };
  }

  onMouseUp(_pos: Point, _state: ToolState, bgCanvas?: HTMLCanvasElement): Shape | null {
    const rect = this.tempRect;
    this.tempRect = null;
    if (!rect || rect.w < 10 || rect.h < 10) return null;
    if (!bgCanvas) return null;

    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.round(rect.w);
    const h = Math.round(rect.h);

    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return null;

    try {
      const imageData = bgCtx.getImageData(x, y, w, h);
      applyBoxBlur(imageData.data, w, h, 15);
      return {
        id: genShapeId(),
        type: 'blur',
        x,
        y,
        w,
        h,
        imageData,
      } satisfies BlurShape;
    } catch {
      return null;
    }
  }

  renderTemp(ctx: CanvasRenderingContext2D): void {
    if (!this.tempRect) return;
    const { x, y, w, h } = this.tempRect;
    ctx.save();
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as BlurShape;
    if (s.imageData) {
      ctx.putImageData(s.imageData, s.x, s.y);
    }
  }

  getCursor(): string {
    return 'crosshair';
  }

  getTempShape(): Shape | null {
    return null;
  }

  getTempRect() {
    return this.tempRect;
  }
}
