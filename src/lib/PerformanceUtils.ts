/**
 * 性能优化工具类
 * 提供节流、防抖等性能优化函数
 */

/**
 * 节流函数
 * 在指定时间间隔内只执行一次函数
 * @param func 要节流的函数
 * @param delay 延迟时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeoutId: number | null = null;

    return function (this: any, ...args: Parameters<T>) {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= delay) {
            lastCall = now;
            func.apply(this, args);
        } else {
            // 确保最后一次调用也会被执行
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            timeoutId = window.setTimeout(() => {
                lastCall = Date.now();
                func.apply(this, args);
                timeoutId = null;
            }, delay - timeSinceLastCall);
        }
    };
}

/**
 * 防抖函数
 * 在事件停止触发后延迟执行函数
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: number | null = null;

    return function (this: any, ...args: Parameters<T>) {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = window.setTimeout(() => {
            func.apply(this, args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * RAF 节流函数
 * 使用 requestAnimationFrame 进行节流
 * @param func 要节流的函数
 * @returns 节流后的函数
 */
export function rafThrottle<T extends (...args: any[]) => any>(
    func: T
): (...args: Parameters<T>) => void {
    let rafId: number | null = null;
    let latestArgs: Parameters<T> | null = null;

    return function (this: any, ...args: Parameters<T>) {
        latestArgs = args;

        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                if (latestArgs !== null) {
                    func.apply(this, latestArgs);
                    latestArgs = null;
                }
                rafId = null;
            });
        }
    };
}

/**
 * 批量执行函数
 * 将多个函数调用合并到一次 RAF 中执行
 */
export class BatchExecutor {
    private pending: Set<() => void> = new Set();
    private rafId: number | null = null;

    /**
     * 添加待执行的函数
     * @param func 函数
     */
    add(func: () => void): void {
        this.pending.add(func);
        this.schedule();
    }

    /**
     * 调度执行
     */
    private schedule(): void {
        if (this.rafId !== null) {
            return;
        }

        this.rafId = requestAnimationFrame(() => {
            this.execute();
        });
    }

    /**
     * 执行所有待执行的函数
     */
    private execute(): void {
        const funcs = Array.from(this.pending);
        this.pending.clear();
        this.rafId = null;

        funcs.forEach((func) => {
            try {
                func();
            } catch (error) {
                console.error('Error in batch executor:', error);
            }
        });
    }

    /**
     * 清除所有待执行的函数
     */
    clear(): void {
        this.pending.clear();
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
    private timers: Map<string, number> = new Map();
    private metrics: Map<string, number[]> = new Map();

    /**
     * 开始计时
     * @param label 标签
     */
    startTimer(label: string): void {
        this.timers.set(label, performance.now());
    }

    /**
     * 结束计时并记录
     * @param label 标签
     * @returns 耗时（毫秒）
     */
    endTimer(label: string): number {
        const startTime = this.timers.get(label);
        if (startTime === undefined) {
            console.warn(`Timer ${label} not found`);
            return 0;
        }

        const duration = performance.now() - startTime;
        this.timers.delete(label);

        // 记录到指标
        if (!this.metrics.has(label)) {
            this.metrics.set(label, []);
        }
        this.metrics.get(label)!.push(duration);

        return duration;
    }

    /**
     * 获取平均耗时
     * @param label 标签
     * @returns 平均耗时（毫秒）
     */
    getAverageTime(label: string): number {
        const times = this.metrics.get(label);
        if (!times || times.length === 0) {
            return 0;
        }

        const sum = times.reduce((a, b) => a + b, 0);
        return sum / times.length;
    }

    /**
     * 获取最大耗时
     * @param label 标签
     * @returns 最大耗时（毫秒）
     */
    getMaxTime(label: string): number {
        const times = this.metrics.get(label);
        if (!times || times.length === 0) {
            return 0;
        }

        return Math.max(...times);
    }

    /**
     * 获取最小耗时
     * @param label 标签
     * @returns 最小耗时（毫秒）
     */
    getMinTime(label: string): number {
        const times = this.metrics.get(label);
        if (!times || times.length === 0) {
            return 0;
        }

        return Math.min(...times);
    }

    /**
     * 清除指标
     * @param label 标签（可选，不传则清除所有）
     */
    clearMetrics(label?: string): void {
        if (label) {
            this.metrics.delete(label);
        } else {
            this.metrics.clear();
        }
    }

    /**
     * 获取所有指标
     * @returns 指标对象
     */
    getAllMetrics(): Record<string, { avg: number; max: number; min: number; count: number }> {
        const result: Record<string, { avg: number; max: number; min: number; count: number }> = {};

        this.metrics.forEach((times, label) => {
            result[label] = {
                avg: this.getAverageTime(label),
                max: this.getMaxTime(label),
                min: this.getMinTime(label),
                count: times.length,
            };
        });

        return result;
    }

    /**
     * 打印所有指标
     */
    printMetrics(): void {
        const metrics = this.getAllMetrics();
        console.table(metrics);
    }
}

/**
 * FPS 计数器
 */
export class FPSCounter {
    private frames: number[] = [];
    private lastTime = performance.now();
    private rafId: number | null = null;

    /**
     * 开始计数
     */
    start(): void {
        if (this.rafId !== null) {
            return;
        }

        this.tick();
    }

    /**
     * 停止计数
     */
    stop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 计数循环
     */
    private tick(): void {
        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;

        // 记录帧时间
        this.frames.push(delta);

        // 只保留最近 60 帧
        if (this.frames.length > 60) {
            this.frames.shift();
        }

        this.rafId = requestAnimationFrame(() => this.tick());
    }

    /**
     * 获取当前 FPS
     * @returns FPS 值
     */
    getFPS(): number {
        if (this.frames.length === 0) {
            return 0;
        }

        const avgDelta = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
        return Math.round(1000 / avgDelta);
    }

    /**
     * 重置计数器
     */
    reset(): void {
        this.frames = [];
        this.lastTime = performance.now();
    }
}

/**
 * 内存监控器
 */
export class MemoryMonitor {
    /**
     * 获取内存使用情况
     * @returns 内存使用情况（MB）
     */
    getMemoryUsage(): number {
        if ('memory' in performance) {
            const memory = (performance as any).memory;
            return Math.round(memory.usedJSHeapSize / 1024 / 1024);
        }
        return 0;
    }

    /**
     * 获取内存限制
     * @returns 内存限制（MB）
     */
    getMemoryLimit(): number {
        if ('memory' in performance) {
            const memory = (performance as any).memory;
            return Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
        }
        return 0;
    }

    /**
     * 获取内存使用百分比
     * @returns 使用百分比
     */
    getMemoryUsagePercent(): number {
        const usage = this.getMemoryUsage();
        const limit = this.getMemoryLimit();
        if (limit === 0) {
            return 0;
        }
        return Math.round((usage / limit) * 100);
    }
}

// 导出单例实例
export const performanceMonitor = new PerformanceMonitor();
export const fpsCounter = new FPSCounter();
export const memoryMonitor = new MemoryMonitor();
export const batchExecutor = new BatchExecutor();
