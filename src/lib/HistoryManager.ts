import type { HistoryEntry, ScreenshotHistoryItem } from '../types';

/**
 * 历史管理器类
 * 负责管理撤销/重做历史记录和截图历史
 */
export class HistoryManager {
    private historyStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];
    private maxHistorySize = 50;
    private screenshotHistory: ScreenshotHistoryItem[] = [];
    private maxScreenshotHistory = 20;
    private saveTimeout: number | null = null;
    private saveDelay = 300; // 防抖延迟 300ms

    /**
     * 保存状态（带防抖）
     * @param state 状态字符串
     */
    saveState(state: string): void {
        // 清除之前的定时器
        if (this.saveTimeout !== null) {
            clearTimeout(this.saveTimeout);
        }

        // 设置新的定时器
        this.saveTimeout = window.setTimeout(() => {
            this.saveStateImmediate(state);
            this.saveTimeout = null;
        }, this.saveDelay);
    }

    /**
     * 立即保存状态
     * @param state 状态字符串
     */
    private saveStateImmediate(state: string): void {
        const entry: HistoryEntry = {
            timestamp: Date.now(),
            state,
        };

        this.historyStack.push(entry);

        // 限制历史记录大小
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
        }

        // 清空重做栈
        this.redoStack = [];

        console.log(`State saved, history size: ${this.historyStack.length}`);
    }

    /**
     * 撤销操作
     * @returns 上一个状态或 null
     */
    undo(): string | null {
        if (this.historyStack.length === 0) {
            console.warn('No history to undo');
            return null;
        }

        const currentState = this.historyStack.pop();
        if (currentState) {
            this.redoStack.push(currentState);
        }

        const previousState = this.historyStack[this.historyStack.length - 1];
        console.log(`Undo performed, history size: ${this.historyStack.length}`);

        return previousState ? previousState.state : null;
    }

    /**
     * 重做操作
     * @returns 下一个状态或 null
     */
    redo(): string | null {
        if (this.redoStack.length === 0) {
            console.warn('No history to redo');
            return null;
        }

        const nextState = this.redoStack.pop();
        if (nextState) {
            this.historyStack.push(nextState);
            console.log(`Redo performed, history size: ${this.historyStack.length}`);
            return nextState.state;
        }

        return null;
    }

    /**
     * 检查是否可以撤销
     * @returns 是否可以撤销
     */
    canUndo(): boolean {
        return this.historyStack.length > 0;
    }

    /**
     * 检查是否可以重做
     * @returns 是否可以重做
     */
    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * 清除历史记录
     */
    clearHistory(): void {
        this.historyStack = [];
        this.redoStack = [];
        console.log('History cleared');
    }

    /**
     * 保存截图到历史记录
     * @param item 截图历史项
     */
    async saveScreenshot(item: ScreenshotHistoryItem): Promise<void> {
        this.screenshotHistory.unshift(item);

        // 限制截图历史数量
        if (this.screenshotHistory.length > this.maxScreenshotHistory) {
            const removed = this.screenshotHistory.splice(this.maxScreenshotHistory);
            // 这里可以删除被移除的截图文件
            console.log(`Removed ${removed.length} old screenshots from history`);
        }

        // 持久化到本地存储
        await this.persistScreenshotHistory();

        console.log(`Screenshot saved to history, total: ${this.screenshotHistory.length}`);
    }

    /**
     * 获取截图历史
     * @returns 截图历史数组
     */
    async getScreenshotHistory(): Promise<ScreenshotHistoryItem[]> {
        // 从本地存储加载
        await this.loadScreenshotHistory();
        return [...this.screenshotHistory];
    }

    /**
     * 删除截图
     * @param id 截图 ID
     */
    async deleteScreenshot(id: string): Promise<void> {
        const index = this.screenshotHistory.findIndex((item) => item.id === id);
        if (index !== -1) {
            this.screenshotHistory.splice(index, 1);
            await this.persistScreenshotHistory();
            console.log(`Screenshot ${id} deleted from history`);
        } else {
            console.warn(`Screenshot ${id} not found in history`);
        }
    }

    /**
     * 清空截图历史
     */
    async clearScreenshotHistory(): Promise<void> {
        this.screenshotHistory = [];
        await this.persistScreenshotHistory();
        console.log('Screenshot history cleared');
    }

    /**
     * 设置最大历史记录大小
     * @param size 最大大小
     */
    setMaxHistorySize(size: number): void {
        this.maxHistorySize = size;
        console.log(`Max history size set to: ${size}`);
    }

    /**
     * 获取历史记录大小
     * @returns 历史记录大小
     */
    getHistorySize(): number {
        return this.historyStack.length;
    }

    /**
     * 持久化截图历史到本地存储
     */
    private async persistScreenshotHistory(): Promise<void> {
        try {
            // 只保存元数据，不保存完整图片
            const metadata = this.screenshotHistory.map((item) => ({
                id: item.id,
                thumbnail: item.thumbnail,
                fullImage: item.fullImage,
                width: item.width,
                height: item.height,
                createdAt: item.createdAt,
                annotations: item.annotations,
            }));

            localStorage.setItem('screenshot_history', JSON.stringify(metadata));
        } catch (error) {
            console.error('Failed to persist screenshot history:', error);
        }
    }

    /**
     * 从本地存储加载截图历史
     */
    private async loadScreenshotHistory(): Promise<void> {
        try {
            const data = localStorage.getItem('screenshot_history');
            if (data) {
                this.screenshotHistory = JSON.parse(data);
                console.log(`Loaded ${this.screenshotHistory.length} screenshots from history`);
            }
        } catch (error) {
            console.error('Failed to load screenshot history:', error);
            this.screenshotHistory = [];
        }
    }

    /**
     * 生成缩略图
     * @param dataUrl 原始图片 DataURL
     * @param maxSize 最大尺寸
     * @returns 缩略图 DataURL
     */
    async generateThumbnail(dataUrl: string, maxSize = 200): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 计算缩放比例
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
            img.src = dataUrl;
        });
    }

    /**
     * 设置保存延迟
     * @param delay 延迟时间（毫秒）
     */
    setSaveDelay(delay: number): void {
        this.saveDelay = delay;
    }
}

// 导出单例实例
export const historyManager = new HistoryManager();
