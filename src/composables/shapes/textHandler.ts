import { IText } from "fabric";
import {
  type ShapeHandler,
  type TextShapeData,
  type Point2D,
  type ControlPointDef,
  type DrawingConfig,
  ShapeRegistry,
} from "./index";

export const TextHandler: ShapeHandler<TextShapeData> = {
  type: "text",

  createData(
    start: Point2D,
    _current: Point2D,
    _points?: Point2D[],
  ): TextShapeData | null {
    // 文本只需要起点，初始为空
    return {
      type: "text",
      x: start.x,
      y: start.y,
      text: "",
      fontSize: 20,
    };
  },

  createPath(data: TextShapeData, config: DrawingConfig): IText {
    const text = new IText(data.text, {
      left: data.x,
      top: data.y,
      fontSize: data.fontSize,
      fill: config.strokeColor,
      selectable: true,
      hasControls: true, // Enable native controls
      hasBorders: true,
      hoverCursor: "move",
      fontFamily: "sans-serif",
      perPixelTargetFind: false,
      padding: 5,
      // Customize controls to match WeChat/QQ (4 corner resizing)
      cornerStyle: "rect",
      cornerColor: "#ffffff",
      cornerStrokeColor: "#999999", // Gray border for handles
      borderColor: "#999999", // Gray dashed border
      borderDashArray: [4, 4],
      transparentCorners: false,
      cornerSize: 8,
      // Disable rotation and middle controls
      lockRotation: true,
    });

    // Only enable corner controls
    text.setControlVisible("mtr", false); // Rotation
    text.setControlVisible("ml", false); // Middle Left
    text.setControlVisible("mr", false); // Middle Right
    text.setControlVisible("mt", false); // Middle Top
    text.setControlVisible("mb", false); // Middle Bottom

    return text;
  },

  move(data: TextShapeData, dx: number, dy: number): TextShapeData {
    return {
      ...data,
      x: data.x + dx,
      y: data.y + dy,
    };
  },

  getControlPoints(): ControlPointDef[] {
    // Return empty array to use Fabric's native controls
    return [];
  },
};

ShapeRegistry.register(TextHandler);
