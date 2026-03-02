import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import type { CaptureWindow, CaptureResult } from '../types';

/**
 * 窗口管理器类
 * 负责管理所有截图窗口的生命周期
 */
export class WindowManager {
    private windows: Map<string, CaptureWindow> = new Map();
    private closeCallbacks: Array<(windowId: string) => void> = [];
    private allClosedCallbacks: Array<() => void> = [];

    /**
     * 创建所有屏幕的截图窗口
     * @param captures 屏幕捕获结果数组
     * @returns 创建的窗口数组
     */
    async createCaptureWindows(captures: CaptureResult[]): Promise<CaptureWindow[]> {
        const windows: CaptureWindow[] = [];

        for (const capture of captures) {
            try {
                const label = `screenshot_${capture.id}`;
                const url = `index.html?screen_id=${capture.id}`;

                // 计算逻辑尺寸
                const logicalWidth = capture.width / capture.scale_factor;
                const logicalHeight = capture.height / capture.scale_factor;
                const logicalX = capture.x;
                const logicalY = capture.y;

                // 创建窗口
                const window = new WebviewWindow(label, {
                    url,
                    title: 'Screenshot',
                    decorations: false,
                    alwaysOnTop: true,
                    skipTaskbar: true,
                    width: logicalWidth,
                    height: logicalHeight,
                    x: logicalX,
                    y: logicalY,
                    resizable: false,
                    focus: true,
                    visible: false, // 初始隐藏，避免闪烁
                });

                const captureWindow: CaptureWindow = {
                    id: label,
                    label,
                    screenIndex: capture.id,
                    handle: window,
                };

                this.windows.set(label, captureWindow);
                windows.push(captureWindow);

                // 监听窗口关闭事件
                window.onCloseRequested(() => {
                    this.handleWindowClosed(label);
                });

                console.log(`Created window for screen ${capture.id}`);
            } catch (error) {
                console.error(`Failed to create window for screen ${capture.id}:`, error);
                // 单个窗口创建失败不影响其他窗口
                continue;
            }
        }

        return windows;
    }

    /**
     * 关闭所有窗口
     */
    async closeAllWindows(): Promise<void> {
        const windowIds = Array.from(this.windows.keys());
        const closePromises = windowIds.map((id) => this.closeWindow(id));

        await Promise.allSettled(closePromises);

        console.log('All windows closed');
    }

    /**
     * 关闭指定窗口
     * @param windowId 窗口 ID
     */
    async closeWindow(windowId: string): Promise<void> {
        const window = this.windows.get(windowId);
        if (!window) {
            console.warn(`Window ${windowId} not found`);
            return;
        }

        try {
            await window.handle.close();
            this.windows.delete(windowId);
            console.log(`Window ${windowId} closed`);
        } catch (error) {
            console.error(`Failed to close window ${windowId}:`, error);
            // 即使关闭失败也从列表中移除
            this.windows.delete(windowId);
        }
    }

    /**
     * 获取活动窗口列表
     * @returns 活动窗口数组
     */
    getActiveWindows(): CaptureWindow[] {
        return Array.from(this.windows.values());
    }

    /**
     * 检查是否还有活动窗口
     * @returns 是否有活动窗口
     */
    hasActiveWindows(): boolean {
        return this.windows.size > 0;
    }

    /**
     * 注册窗口关闭回调
     * @param callback 回调函数
     */
    onWindowClosed(callback: (windowId: string) => void): void {
        this.closeCallbacks.push(callback);
    }

    /**
     * 注册所有窗口关闭回调
     * @param callback 回调函数
     */
    onAllWindowsClosed(callback: () => void): void {
        this.allClosedCallbacks.push(callback);
    }

    /**
     * 处理窗口关闭事件
     * @param windowId 窗口 ID
     */
    private handleWindowClosed(windowId: string): void {
        this.windows.delete(windowId);
        console.log(`Window ${windowId} closed by user`);

        // 触发回调
        this.closeCallbacks.forEach((callback) => {
            try {
                callback(windowId);
            } catch (error) {
                console.error('Error in window close callback:', error);
            }
        });

        // 如果所有窗口都关闭了，触发清理
        if (!this.hasActiveWindows()) {
            console.log('All windows closed, triggering cleanup');
            this.triggerCleanup();
        }
    }

    /**
     * 触发清理操作
     */
    private async triggerCleanup(): Promise<void> {
        console.log('Cleanup triggered');

        // 触发所有窗口关闭回调
        this.allClosedCallbacks.forEach((callback) => {
            try {
                callback();
            } catch (error) {
                console.error('Error in all windows closed callback:', error);
            }
        });

        // 调用后端清理临时文件
        try {
            await invoke('cleanup_temp_files');
            console.log('Temp files cleaned up successfully');
        } catch (error) {
            console.error('Failed to cleanup temp files:', error);
        }
    }

    /**
     * 清除所有回调
     */
    clearCallbacks(): void {
        this.closeCallbacks = [];
        this.allClosedCallbacks = [];
    }

    /**
     * 获取窗口数量
     * @returns 窗口数量
     */
    getWindowCount(): number {
        return this.windows.size;
    }
}

// 导出单例实例
export const windowManager = new WindowManager();
