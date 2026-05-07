import type { Point, Shape, TextShape, ToolState } from '../types';
import { type BaseTool, genShapeId } from './BaseTool';

/**
 * 文字工具
 * 不通过 onMouseUp 返回 Shape（需要等用户输入文字）
 * 点击后触发 onTextInput 回调，由外部提供 TextInput UI
 */
export class TextTool implements BaseTool {
  readonly type = 'text' as const;
  private pendingPos: Point | null = null;
  private onTextInput: ((pos: Point, config: ToolState['drawingConfig']) => void) | null = null;

  onActivate(): void {}
  onDeactivate(): void {
    this.pendingPos = null;
  }

  /** 设置文字输入回调 */
  setTextInputCallback(cb: (pos: Point, config: ToolState['drawingConfig']) => void): void {
    this.onTextInput = cb;
  }

  onMouseDown(pos: Point, state: ToolState): void {
    this.pendingPos = { ...pos };
    if (this.onTextInput) {
      this.onTextInput(pos, state.drawingConfig);
    }
  }

  onMouseMove(_pos: Point, _state: ToolState): void {}

  onMouseUp(_pos: Point, _state: ToolState): Shape | null {
    // 文字工具不在 mouseUp 返回 shape，由 completeText 创建
    return null;
  }

  /** 文字输入完成，创建 TextShape */
  completeText(text: string, pos: Point, config: ToolState['drawingConfig']): TextShape | null {
    if (!text.trim()) return null;
    return {
      id: genShapeId(),
      type: 'text',
      x: pos.x,
      y: pos.y,
      text,
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      color: config.strokeColor,
    };
  }

  renderTemp(_ctx: CanvasRenderingContext2D): void {
    // 文字工具无临时预览（TextInput 由 React 渲染）
  }

  renderShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const s = shape as TextShape;
    ctx.save();
    ctx.font = `${s.fontSize}px ${s.fontFamily}`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'top';
    // 支持多行文本
    const lines = s.text.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, s.x, s.y + i * (s.fontSize * 1.2));
    });
    ctx.restore();
  }

  getCursor(): string {
    return 'text';
  }

  getTempShape(): Shape | null {
    return null;
  }

  getPendingPos(): Point | null {
    return this.pendingPos;
  }
}
