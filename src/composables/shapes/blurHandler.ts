/**
 * 模糊图形处理器
 *
 * 在选定矩形区域内对背景图像应用高斯模糊效果。
 * 产生 FabricImage 对象而非 Path 对象。
 */

import { FabricImage, FabricObject, Path } from 'fabric';
import {
  type ShapeHandler,
  type BlurShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from './index';
import { setDebugState } from './debug';

/** 对 ImageData 应用 StackBlur 算法 */
function applyBlur(imageData: ImageData, radius: number): void {
  const { data, width, height } = imageData;
  if (radius < 1) return;

  const wm = width - 1;
  const hm = height - 1;
  const wh = width * height;
  const rad1 = radius + 1;

  const r: number[] = new Array(wh);
  const g: number[] = new Array(wh);
  const b: number[] = new Array(wh);
  const a: number[] = new Array(wh);

  const vmin: number[] = new Array(Math.max(width, height));
  const vmax: number[] = new Array(Math.max(width, height));

  const mulSum = [
    512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292, 512, 454, 405, 364,
    328, 298, 271, 496, 456, 420, 388, 360, 335, 312, 292, 273, 512, 482, 454, 428, 405, 383, 364,
    345, 328, 312, 298, 284, 271, 259, 496, 475, 456, 437, 420, 404, 388, 374, 360, 347, 335, 323,
    312, 302, 292, 282, 273, 265, 512, 497, 482, 468, 454, 441, 428, 417, 405, 394, 383, 373, 364,
    354, 345, 337, 328, 320, 312, 305, 298, 291, 284, 278, 271, 265, 259, 507, 496, 485, 475, 465,
    456, 446, 437, 428, 420, 412, 404, 396, 388, 381, 374, 367, 360, 354, 347, 341, 335, 329, 323,
    318, 312, 307, 302, 297, 292, 287, 282, 278, 273, 269, 265, 261, 512, 505, 497, 489, 482, 475,
    468, 461, 454, 447, 441, 435, 428, 422, 417, 411, 405, 399, 394, 389, 383, 378, 373, 368, 364,
    359, 354, 350, 345, 341, 337, 332, 328, 324, 320, 316, 312, 309, 305, 301, 298, 294, 291, 287,
    284, 281, 278, 274, 271, 268, 265, 262, 259, 257, 507, 501, 496, 491, 485, 480, 475, 470, 465,
    460, 456, 451, 446, 442, 437, 433, 428, 424, 420, 416, 412, 408, 404, 400, 396, 392, 388, 385,
    381, 377, 374, 370, 367, 363, 360, 357, 354, 350, 347, 344, 341, 338, 335, 332, 329, 326, 323,
    320, 318, 315, 312, 310, 307, 304, 302, 299, 297, 294, 292, 289, 287, 285, 282, 280, 278, 275,
    273, 271, 269, 267, 265, 263, 261, 259,
  ];

  const shgSum = [
    9, 11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17, 17, 17, 17, 17, 17, 17, 18, 18,
    18, 18, 18, 18, 18, 18, 18, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20,
    20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21,
    21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22,
    22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
    22, 22, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  ];

  const mulSumVal = mulSum[radius] || mulSum[mulSum.length - 1];
  const shgSumVal = shgSum[radius] || shgSum[shgSum.length - 1];

  let rsum: number,
    gsum: number,
    bsum: number,
    asum: number,
    p: number,
    p1: number,
    p2: number,
    yi: number,
    yw: number;
  let rbs: number;

  yw = yi = 0;

  for (let y = 0; y < height; y++) {
    rsum = data[yi] * rad1;
    gsum = data[yi + 1] * rad1;
    bsum = data[yi + 2] * rad1;
    asum = data[yi + 3] * rad1;

    for (let i = 1; i <= radius; i++) {
      p = yi + ((i > wm ? wm : i) << 2);
      rsum += data[p];
      gsum += data[p + 1];
      bsum += data[p + 2];
      asum += data[p + 3];
    }

    for (let x = 0; x < width; x++) {
      r[yi] = rsum;
      g[yi] = gsum;
      b[yi] = bsum;
      a[yi] = asum;

      if (y === 0) {
        vmin[x] = Math.min(x + rad1, wm);
        vmax[x] = Math.max(x - radius, 0);
      }
      p1 = (yw + vmin[x]) << 2;
      p2 = (yw + vmax[x]) << 2;

      rsum += data[p1] - data[p2];
      gsum += data[p1 + 1] - data[p2 + 1];
      bsum += data[p1 + 2] - data[p2 + 2];
      asum += data[p1 + 3] - data[p2 + 3];

      yi++;
    }
    yw += width;
  }

  for (let x = 0; x < width; x++) {
    yi = x;
    rsum = r[yi] * rad1;
    gsum = g[yi] * rad1;
    bsum = b[yi] * rad1;
    asum = a[yi] * rad1;

    for (let i = 1; i <= radius; i++) {
      p = yi + Math.min(i, hm) * width;
      rsum += r[p];
      gsum += g[p];
      bsum += b[p];
      asum += a[p];
    }

    for (let y = 0; y < height; y++) {
      rbs = yi << 2;
      data[rbs] = (rsum * mulSumVal) >>> shgSumVal;
      data[rbs + 1] = (gsum * mulSumVal) >>> shgSumVal;
      data[rbs + 2] = (bsum * mulSumVal) >>> shgSumVal;
      data[rbs + 3] = (asum * mulSumVal) >>> shgSumVal;

      if (x === 0) {
        vmin[y] = Math.min(y + rad1, hm) * width;
        vmax[y] = Math.max(y - radius, 0) * width;
      }
      p1 = x + vmin[y];
      p2 = x + vmax[y];

      rsum += r[p1] - r[p2];
      gsum += g[p1] - g[p2];
      bsum += b[p1] - b[p2];
      asum += a[p1] - a[p2];

      yi += width;
    }
  }
}

/** 从背景画布提取区域像素并应用模糊 */
function createBlurredImage(data: BlurShapeData, blurRadius: number): HTMLCanvasElement | null {
  const bgCanvas = ShapeRegistry.getBackgroundCanvas();
  const offset = ShapeRegistry.getSelectionOffset();

  setDebugState(
    'lastRegistryBg',
    bgCanvas ? { width: bgCanvas.width, height: bgCanvas.height } : null
  );
  setDebugState('lastRegistryOffset', offset);

  if (!bgCanvas) {
    return null;
  }

  // Convert fabric canvas coordinates to original screenshot coordinates
  const left = Math.round(Math.min(data.x1, data.x2) + offset.x);
  const top = Math.round(Math.min(data.y1, data.y2) + offset.y);
  const w = Math.round(Math.abs(data.x2 - data.x1));
  const h = Math.round(Math.abs(data.y2 - data.y1));

  setDebugState('lastImageData', { left, top, w, h });

  if (w < 2 || h < 2) {
    return null;
  }

  const ctx = bgCanvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.getImageData(left, top, w, h);
  applyBlur(imageData, blurRadius);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return null;
  outCtx.putImageData(imageData, 0, 0);

  setDebugState('lastBlurCanvas', { width: outCanvas.width, height: outCanvas.height });
  return outCanvas;
}

export const BlurHandler: ShapeHandler<BlurShapeData> = {
  type: 'blur',

  createData(start: Point2D, current: Point2D): BlurShapeData | null {
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);

    setDebugState('lastBlurData', {
      createDataStart: { x: start.x, y: start.y },
      createDataCurrent: { x: current.x, y: current.y },
      size: { w: width, h: height },
    });

    if (width < 2 || height < 2) return null;

    return {
      type: 'blur',
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y,
    };
  },

  createPath(data: BlurShapeData, _config: DrawingConfig): FabricObject {
    console.log('[BlurHandler.createPath] data:', data);
    const blurRadius = 12;
    const blurredCanvas = createBlurredImage(data, blurRadius);
    console.log(
      '[BlurHandler.createPath] blurredCanvas:',
      blurredCanvas ? `${blurredCanvas.width}x${blurredCanvas.height}` : 'null'
    );

    const left = Math.min(data.x1, data.x2);
    const top = Math.min(data.y1, data.y2);
    const w = Math.abs(data.x2 - data.x1);
    const h = Math.abs(data.y2 - data.y1);

    console.log('[BlurHandler.createPath] FabricImage position:', { left, top, w, h });

    if (blurredCanvas) {
      const img = new FabricImage(blurredCanvas, {
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
      console.log('[BlurHandler.createPath] FabricImage created successfully');
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

  move(data: BlurShapeData, dx: number, dy: number): BlurShapeData {
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
          const d = data as BlurShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as BlurShapeData;
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
          const d = data as BlurShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as BlurShapeData;
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
          const d = data as BlurShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as BlurShapeData;
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
          const d = data as BlurShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as BlurShapeData;
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

ShapeRegistry.register(BlurHandler);
