import type { MosaicShape, Point, Shape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

function applyMosaic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number
): void {
  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      const bw = Math.min(blockSize, width - x);
      const bh = Math.min(blockSize, height - y);
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }

      const ar = r / count,
        ag = g / count,
        ab = b / count,
        aa = a / count;

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          data[idx] = ar;
          data[idx + 1] = ag;
          data[idx + 2] = ab;
          data[idx + 3] = aa;
        }
      }
    }
  }
}

export class MosaicTool implements BaseTool {
  readonly type = 'mosaic' as const;
  private tempRect: { x: number; y: number; w: number; h: number } | null = null;
  private startPos: Point = { x: 0, y: 0 };
  readonly blockSize = 10;

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
      applyMosaic(imageData.data, w, h, this.blockSize);
      return {
        id: genShapeId(),
        type: 'mosaic',
        x,
        y,
        w,
        h,
        blockSize: this.blockSize,
        imageData,
      } satisfies MosaicShape;
    } catch {
      return null;
    }
  }

  renderTemp(ctx: CanvasRenderingContext2D): void {
    if (!this.tempRect) return;
    const { x, y, w, h } = this.tempRect;
    ctx.save();
    ctx.strokeStyle = '#ff6d00';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as MosaicShape;
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
