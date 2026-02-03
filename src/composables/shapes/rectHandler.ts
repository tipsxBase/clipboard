/**
 * 矩形图形处理器
 */

import { Path } from "fabric";
import {
  type ShapeHandler,
  type RectShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from "./index";

/** 矩形控制点 ID */
type RectControlId = "tl" | "tr" | "bl" | "br"; // 四个角

/** 创建矩形 Path 数据 */
function buildRectPathData(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
}

/** 矩形处理器 */
export const RectHandler: ShapeHandler<RectShapeData> = {
  type: "rect",

  createData(start: Point2D, current: Point2D): RectShapeData | null {
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);

    if (width < 2 || height < 2) return null;

    return {
      type: "rect",
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y,
    };
  },

  createPath(data: RectShapeData, config: DrawingConfig): Path {
    const pathData = buildRectPathData(data.x1, data.y1, data.x2, data.y2);

    return new Path(pathData, {
      fill: "transparent",
      stroke: config.strokeColor,
      strokeWidth: config.strokeWidth,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      selectable: true,
      hasControls: false,
      hasBorders: false,
      lockScalingX: true,
      lockScalingY: true,
      perPixelTargetFind: true,
      hoverCursor: "move", // 设置悬停光标
    });
  },

  move(data: RectShapeData, dx: number, dy: number): RectShapeData {
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
      fill: "#ffffff",
      stroke: "#0066ff",
      strokeWidth: 2,
    };

    return [
      {
        id: "tl" as RectControlId,
        getPosition: (data) => {
          const d = data as RectShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as RectShapeData;
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
        id: "tr" as RectControlId,
        getPosition: (data) => {
          const d = data as RectShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as RectShapeData;
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
        id: "bl" as RectControlId,
        getPosition: (data) => {
          const d = data as RectShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as RectShapeData;
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
        id: "br" as RectControlId,
        getPosition: (data) => {
          const d = data as RectShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as RectShapeData;
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

// 注册到图形注册表
ShapeRegistry.register(RectHandler);
