import type { Shape } from '../types';

/**
 * 命令接口 - 支持撤销/重做
 */
export interface Command {
  execute(): void;
  undo(): void;
}

/**
 * 绘制命令 - 添加一个 Shape
 */
export class DrawCommand implements Command {
  constructor(
    private shapes: Shape[],
    private newShape: Shape,
    private onRender: () => void
  ) {}

  execute(): void {
    this.shapes.push(this.newShape);
    this.onRender();
  }

  undo(): void {
    const index = this.shapes.indexOf(this.newShape);
    if (index !== -1) {
      this.shapes.splice(index, 1);
    }
    this.onRender();
  }
}

/**
 * 命令队列 - 管理撤销/重做历史
 */
export class CommandQueue {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
  }

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      return true;
    }
    return false;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      return true;
    }
    return false;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
