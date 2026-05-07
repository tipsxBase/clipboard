/**
 * 马赛克图形处理器
 *
 * 在选定矩形区域内对背景图像应用马赛克（像素化）效果。
 * 产生 FabricImage 对象而非 Path 对象。
 */

import { FabricImage, FabricObject, Path } from 'fabric';
import {
  type ShapeHandler,
  type MosaicShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from './index';

/** 对 ImageData 应用马赛克效果 */
function applyMosaic(imageData: ImageData, blockSize: number): void {
  const { data, width, height } = imageData;
  const size = Math.max(2, Math.round(blockSize));

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      // 取块内平均颜色
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0,
        count = 0;

      const bw = Math.min(size, width - x);
      const bh = Math.min(size, height - y);

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          aSum += data[idx + 3];
          count++;
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      // 填充块内所有像素为平均颜色
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          data[idx] = rAvg;
          data[idx + 1] = gAvg;
          data[idx + 2] = bAvg;
          data[idx + 3] = aAvg;
        }
      }
    }
  }
}

/** 从背景画布提取区域像素并应用马赛克 */
function createMosaicImage(data: MosaicShapeData, blockSize: number): HTMLCanvasElement | null {
  const bgCanvas = ShapeRegistry.getBackgroundCanvas();
  const offset = ShapeRegistry.getSelectionOffset();
  if (!bgCanvas) return null;

  // Convert fabric canvas coordinates to original screenshot coordinates
  const left = Math.round(Math.min(data.x1, data.x2) + offset.x);
  const top = Math.round(Math.min(data.y1, data.y2) + offset.y);
  const w = Math.round(Math.abs(data.x2 - data.x1));
  const h = Math.round(Math.abs(data.y2 - data.y1));
  if (w < 2 || h < 2) return null;

  const ctx = bgCanvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.getImageData(left, top, w, h);
  applyMosaic(imageData, blockSize);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return null;
  outCtx.putImageData(imageData, 0, 0);

  return outCanvas;
}

export const MosaicHandler: ShapeHandler<MosaicShapeData> = {
  type: 'mosaic',

  createData(start: Point2D, current: Point2D): MosaicShapeData | null {
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    if (width < 2 || height < 2) return null;

    return {
      type: 'mosaic',
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y,
    };
  },

  createPath(data: MosaicShapeData, _config: DrawingConfig): FabricObject {
    const blockSize = 10;
    const mosaicCanvas = createMosaicImage(data, blockSize);

    const left = Math.min(data.x1, data.x2);
    const top = Math.min(data.y1, data.y2);
    const w = Math.abs(data.x2 - data.x1);
    const h = Math.abs(data.y2 - data.y1);

    if (mosaicCanvas) {
      const img = new FabricImage(mosaicCanvas, {
        left,
        top,
        originX: 'left',
        originY: 'top',
        selectable: true,
        hasControls: false,
        hasBorders: false,
        lockScalingX: true,
        lockScalingY: true,
        perPixelTargetFind: false,
        hoverCursor: 'move',
      });
      return img;
    }

    // Fallback: semi-transparent rectangle if background is unavailable
    const pathData = `M ${left} ${top} L ${left + w} ${top} L ${left + w} ${top + h} L ${left} ${top + h} Z`;
    return new Path(pathData, {
      fill: 'rgba(128, 128, 128, 0.5)',
      stroke: 'transparent',
      selectable: true,
      hasControls: false,
      hasBorders: false,
      lockScalingX: true,
      lockScalingY: true,
      perPixelTargetFind: true,
      hoverCursor: 'move',
    });
  },

  move(data: MosaicShapeData, dx: number, dy: number): MosaicShapeData {
    return {
      ...data,
      x1: data.x1 + dx,
      y1: data.y1 + dy,
      x2: data.x2 + dx,
      y2: data.y2 + dy,
    };
  },

  getControlPoints(): ControlPointDef[] {
    const defaultStyle = {
      radius: 5,
      fill: '#ffffff',
      stroke: '#0066ff',
      strokeWidth: 2,
    };

    return [
      {
        id: 'tl',
        getPosition: (data) => {
          const d = data as MosaicShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as MosaicShapeData;
          const isX1Left = d.x1 <= d.x2;
          const isY1Top = d.y1 <= d.y2;
          return {
            ...d,
            x1: isX1Left ? newPos.x : d.x1,
            y1: isY1Top ? newPos.y : d.y1,
            x2: isX1Left ? d.x2 : newPos.x,
            y2: isY1Top ? d.y2 : newPos.y,
          };
        },
        style: defaultStyle,
      },
      {
        id: 'tr',
        getPosition: (data) => {
          const d = data as MosaicShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as MosaicShapeData;
          const isX1Left = d.x1 <= d.x2;
          const isY1Top = d.y1 <= d.y2;
          return {
            ...d,
            x1: isX1Left ? d.x1 : newPos.x,
            y1: isY1Top ? newPos.y : d.y1,
            x2: isX1Left ? newPos.x : d.x2,
            y2: isY1Top ? d.y2 : newPos.y,
          };
        },
        style: defaultStyle,
      },
      {
        id: 'bl',
        getPosition: (data) => {
          const d = data as MosaicShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as MosaicShapeData;
          const isX1Left = d.x1 <= d.x2;
          const isY1Top = d.y1 <= d.y2;
          return {
            ...d,
            x1: isX1Left ? newPos.x : d.x1,
            y1: isY1Top ? d.y1 : newPos.y,
            x2: isX1Left ? d.x2 : newPos.x,
            y2: isY1Top ? newPos.y : d.y2,
          };
        },
        style: defaultStyle,
      },
      {
        id: 'br',
        getPosition: (data) => {
          const d = data as MosaicShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as MosaicShapeData;
          const isX1Left = d.x1 <= d.x2;
          const isY1Top = d.y1 <= d.y2;
          return {
            ...d,
            x1: isX1Left ? d.x1 : newPos.x,
            y1: isY1Top ? d.y1 : newPos.y,
            x2: isX1Left ? newPos.x : d.x2,
            y2: isY1Top ? newPos.y : d.y2,
          };
        },
        style: defaultStyle,
      },
    ];
  },
};

ShapeRegistry.register(MosaicHandler);
