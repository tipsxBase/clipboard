/**
 * 椭圆图形处理器
 */

import { Path } from "fabric";
import {
  type ShapeHandler,
  type EllipseShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from "./index";

/** 椭圆控制点 ID */
type EllipseControlId = "tl" | "tr" | "bl" | "br"; // 四个角

/** 创建椭圆 Path 数据（使用贝塞尔曲线） */
function buildEllipsePathData(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;

  // 使用 4 段贝塞尔曲线近似椭圆
  // 控制点系数 k ≈ 0.5522847498
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;

  return [
    `M ${cx} ${cy - ry}`,
    `C ${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}`,
    "Z",
  ].join(" ");
}

/** 椭圆处理器 */
export const EllipseHandler: ShapeHandler<EllipseShapeData> = {
  type: "ellipse",

  createData(start: Point2D, current: Point2D): EllipseShapeData | null {
    const rx = Math.abs(current.x - start.x) / 2;
    const ry = Math.abs(current.y - start.y) / 2;

    if (rx < 2 || ry < 2) return null;

    return {
      type: "ellipse",
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y,
    };
  },

  createPath(data: EllipseShapeData, config: DrawingConfig): Path {
    const pathData = buildEllipsePathData(data.x1, data.y1, data.x2, data.y2);

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

  move(data: EllipseShapeData, dx: number, dy: number): EllipseShapeData {
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
        id: "tl" as EllipseControlId,
        getPosition: (data) => {
          const d = data as EllipseShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as EllipseShapeData;
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
        id: "tr" as EllipseControlId,
        getPosition: (data) => {
          const d = data as EllipseShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.min(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as EllipseShapeData;
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
        id: "bl" as EllipseControlId,
        getPosition: (data) => {
          const d = data as EllipseShapeData;
          return { x: Math.min(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as EllipseShapeData;
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
        id: "br" as EllipseControlId,
        getPosition: (data) => {
          const d = data as EllipseShapeData;
          return { x: Math.max(d.x1, d.x2), y: Math.max(d.y1, d.y2) };
        },
        onDrag: (data, newPos) => {
          const d = data as EllipseShapeData;
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
ShapeRegistry.register(EllipseHandler);
