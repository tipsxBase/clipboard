/**
 * 画笔（自由路径）图形处理器
 */

import { Path } from "fabric";
import {
  type ShapeHandler,
  type PenShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from "./index";

/** 创建画笔 Path 数据 */
function buildPenPathData(points: Point2D[]): string {
  if (points.length < 2) return "";

  return points.reduce((acc, p, i) => {
    return acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
  }, "");
}

/** 画笔处理器 */
export const PenHandler: ShapeHandler<PenShapeData> = {
  type: "pen",

  createData(
    start: Point2D,
    current: Point2D,
    points?: Point2D[],
  ): PenShapeData | null {
    const allPoints = points || [start, current];

    if (allPoints.length < 2) return null;

    return {
      type: "pen",
      points: [...allPoints],
    };
  },

  createPath(data: PenShapeData, config: DrawingConfig): Path {
    const pathData = buildPenPathData(data.points);

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

  move(data: PenShapeData, dx: number, dy: number): PenShapeData {
    return {
      ...data,
      points: data.points.map((p) => ({
        x: p.x + dx,
        y: p.y + dy,
      })),
    };
  },

  getControlPoints(): ControlPointDef[] {
    // 画笔路径不需要控制点（太多点不实用）
    // 如果需要，可以只提供起点和终点的控制点
    const defaultStyle = {
      radius: 5,
      fill: "#ffffff",
      stroke: "#0066ff",
      strokeWidth: 2,
    };

    return [
      {
        id: "start",
        getPosition: (data) => {
          const d = data as PenShapeData;
          return d.points[0] || { x: 0, y: 0 };
        },
        onDrag: (data, newPos) => {
          const d = data as PenShapeData;
          if (d.points.length === 0) return d;

          // 移动起点，同时平移所有点
          const dx = newPos.x - d.points[0].x;
          const dy = newPos.y - d.points[0].y;

          return {
            ...d,
            points: d.points.map((p) => ({
              x: p.x + dx,
              y: p.y + dy,
            })),
          };
        },
        style: defaultStyle,
      },
      {
        id: "end",
        getPosition: (data) => {
          const d = data as PenShapeData;
          return d.points[d.points.length - 1] || { x: 0, y: 0 };
        },
        onDrag: (data, newPos) => {
          const d = data as PenShapeData;
          if (d.points.length === 0) return d;

          // 移动终点 (改为平移整个图形，不再改变形状)
          const end = d.points[d.points.length - 1];
          const dx = newPos.x - end.x;
          const dy = newPos.y - end.y;

          return {
            ...d,
            points: d.points.map((p) => ({
              x: p.x + dx,
              y: p.y + dy,
            })),
          };
        },
        style: defaultStyle,
      },
    ];
  },
};

// 注册到图形注册表
ShapeRegistry.register(PenHandler);
