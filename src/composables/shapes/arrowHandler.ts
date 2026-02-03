/**
 * 箭头图形处理器
 */

import { Path } from "fabric";
import {
  type ShapeHandler,
  type ArrowShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from "./index";

/** 箭头控制点 ID */
type ArrowControlId = "start" | "end"; // 起点和终点

/** 创建箭头 Path 数据（闭合填充箭头） */
function buildArrowPathData(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number = 3,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  // 箭头参数 - 基于线宽调整
  // 基础线宽是 3，比例是 1
  const scale = Math.max(0.5, width / 3);

  const shaftWidth = 2 * scale; // 箭杆宽度的一半 (变细)
  const headLength = Math.min(30 * scale, length * 0.4); // 箭头头部长度
  const headWidth = 10 * scale; // 箭头头部宽度的一半 (变粗)

  // 箭杆与箭头连接点（箭头底部）
  const neckX = x2 - headLength * Math.cos(angle);
  const neckY = y2 - headLength * Math.sin(angle);

  // 计算垂直于箭头方向的偏移
  const perpAngle = angle + Math.PI / 2;
  const cosPerp = Math.cos(perpAngle);
  const sinPerp = Math.sin(perpAngle);

  // 箭杆的4个角点
  const tail1X = x1 + shaftWidth * cosPerp;
  const tail1Y = y1 + shaftWidth * sinPerp;
  const tail2X = x1 - shaftWidth * cosPerp;
  const tail2Y = y1 - shaftWidth * sinPerp;

  // 箭杆与箭头连接处的4个点
  const neck1X = neckX + shaftWidth * cosPerp;
  const neck1Y = neckY + shaftWidth * sinPerp;
  const neck2X = neckX - shaftWidth * cosPerp;
  const neck2Y = neckY - shaftWidth * sinPerp;

  // 箭头底部的两个外角
  const head1X = neckX + headWidth * cosPerp;
  const head1Y = neckY + headWidth * sinPerp;
  const head2X = neckX - headWidth * cosPerp;
  const head2Y = neckY - headWidth * sinPerp;

  // 一笔绘制闭合箭头
  return [
    `M ${tail1X} ${tail1Y}`, // 起点：尾部上角
    `L ${neck1X} ${neck1Y}`, // 到箭杆与箭头连接处上角
    `L ${head1X} ${head1Y}`, // 到箭头底部上外角
    `L ${x2} ${y2}`, // 到箭头尖端
    `L ${head2X} ${head2Y}`, // 到箭头底部下外角
    `L ${neck2X} ${neck2Y}`, // 到箭杆与箭头连接处下角
    `L ${tail2X} ${tail2Y}`, // 到尾部下角
    "Z", // 闭合
  ].join(" ");
}

/** 箭头处理器 */
export const ArrowHandler: ShapeHandler<ArrowShapeData> = {
  type: "arrow",
  isFilled: true,

  createData(start: Point2D, current: Point2D): ArrowShapeData | null {
    const dx = Math.abs(current.x - start.x);
    const dy = Math.abs(current.y - start.y);

    if (dx < 5 && dy < 5) return null;

    return {
      type: "arrow",
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y,
    };
  },

  createPath(data: ArrowShapeData, config: DrawingConfig): Path {
    const pathData = buildArrowPathData(
      data.x1,
      data.y1,
      data.x2,
      data.y2,
      config.strokeWidth,
    );

    return new Path(pathData, {
      fill: config.strokeColor, // 填充箭头
      stroke: config.strokeColor,
      strokeWidth: 1, // 实际宽度体现在路径几何中
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

  move(data: ArrowShapeData, dx: number, dy: number): ArrowShapeData {
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
      radius: 6,
      fill: "#ffffff",
      stroke: "#0066ff",
      strokeWidth: 2,
    };

    return [
      {
        id: "start" as ArrowControlId,
        getPosition: (data) => {
          const d = data as ArrowShapeData;
          return { x: d.x1, y: d.y1 };
        },
        onDrag: (data, newPos) => {
          const d = data as ArrowShapeData;
          return {
            ...d,
            x1: newPos.x,
            y1: newPos.y,
          };
        },
        style: defaultStyle,
      },
      {
        id: "end" as ArrowControlId,
        getPosition: (data) => {
          const d = data as ArrowShapeData;
          return { x: d.x2, y: d.y2 };
        },
        onDrag: (data, newPos) => {
          const d = data as ArrowShapeData;
          return {
            ...d,
            x2: newPos.x,
            y2: newPos.y,
          };
        },
        style: defaultStyle,
      },
    ];
  },
};

// 注册到图形注册表
ShapeRegistry.register(ArrowHandler);
