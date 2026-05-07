import type { SelectionRect } from '../types';

/** 8 个 resize 句柄定义 */
export const HANDLE_SIZE = 8;

export interface HandleInfo {
  id: string;
  x: number;
  y: number;
}

export function getResizeHandles(sel: SelectionRect): HandleInfo[] {
  const { x, y, w, h } = sel;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return [
    { id: 'nw', x, y },
    { id: 'n', x: cx, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: cy },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: cx, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: cy },
  ];
}

/**
 * 背景 Canvas 渲染器
 * 只渲染一次截图图像
 */
export class BackgroundRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  render(imageSrc: string, physicalWidth: number, physicalHeight: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.canvas.width = physicalWidth;
        this.canvas.height = physicalHeight;
        this.ctx.drawImage(img, 0, 0, physicalWidth, physicalHeight);
        resolve();
      };
      img.onerror = reject;
      img.src = imageSrc;
    });
  }
}

/**
 * 遮罩 Canvas 渲染器
 * 绘制半透明遮罩 + 选区 + resize 句柄
 */
export class MaskRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  render(
    selection: SelectionRect | null,
    isSelecting: boolean,
    scaleFactor: { x: number; y: number }
  ): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    if (!selection || (selection.w < 1 && selection.h < 1)) {
      // 无选区时全屏遮罩
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const { x, y, w, h } = selection;
    const sx = x * scaleFactor.x;
    const sy = y * scaleFactor.y;
    const sw = w * scaleFactor.x;
    const sh = h * scaleFactor.y;

    // 半透明遮罩（排除选区）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);
    ctx.clearRect(sx, sy, sw, sh);

    // 选区边框
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, sw, sh);

    // 绘制 resize 句柄
    if (!isSelecting && w > 10 && h > 10) {
      const handles = getResizeHandles({
        x: sx,
        y: sy,
        w: sw,
        h: sh,
      });
      const hs = HANDLE_SIZE;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 1;
      handles.forEach(({ x: hx, y: hy }) => {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      });

      // 三分线（rule of thirds）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + (sw / 3) * i, sy);
        ctx.lineTo(sx + (sw / 3) * i, sy + sh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx, sy + (sh / 3) * i);
        ctx.lineTo(sx + sw, sy + (sh / 3) * i);
        ctx.stroke();
      }
    }
  }

  /** 在物理像素坐标下检测鼠标所在的句柄 */
  hitTestHandle(
    px: number,
    py: number,
    selection: SelectionRect,
    scaleFactor: { x: number; y: number }
  ): string | null {
    if (!selection || selection.w < 10 || selection.h < 10) return null;

    const sx = selection.x * scaleFactor.x;
    const sy = selection.y * scaleFactor.y;
    const sw = selection.w * scaleFactor.x;
    const sh = selection.h * scaleFactor.y;
    const hs = HANDLE_SIZE;

    const handles = getResizeHandles({ x: sx, y: sy, w: sw, h: sh });
    for (const { id, x, y } of handles) {
      if (px >= x - hs && px <= x + hs && py >= y - hs && py <= y + hs) {
        return id;
      }
    }

    // 命中选区内部 → move
    if (px >= sx && px <= sx + sw && py >= sy && py <= sy + sh) {
      return 'move';
    }

    return null;
  }
}

/**
 * 标注 Canvas 渲染器
 * 渲染所有已完成的 Shape 和绘制中的临时 Shape
 */
export class AnnotationRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  scheduleRender(fn: () => void): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      fn();
    });
  }

  renderNow(fn: () => void): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    fn();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}

/**
 * 放大镜 Canvas 渲染器
 */
export class MagnifierRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly size = 120;
  readonly zoom = 4;
  readonly sampleRadius = 15; // 采样半径（物理像素）

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = canvas.getContext('2d')!;
  }

  render(bgCanvas: HTMLCanvasElement, px: number, py: number): void {
    const ctx = this.ctx;
    const { size, zoom, sampleRadius } = this;
    const radius = sampleRadius;

    ctx.clearRect(0, 0, size, size);

    // 绘制放大的区域
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgCanvas, px - radius, py - radius, radius * 2, radius * 2, 0, 0, size, size);

    // 中心十字线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();

    // 中心点红点
    ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
    ctx.fill();

    void zoom; // 抑制未使用警告
  }
}
