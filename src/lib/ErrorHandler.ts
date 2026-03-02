import { ErrorType } from '../types';
import type { AppError } from '../types';

/**
 * 错误处理器类
 * 负责统一的错误处理和日志记录
 */
export class ErrorHandler {
    private errors: AppError[] = [];
    private maxErrors = 100;
    private errorCallbacks: Array<(error: AppError) => void> = [];

    /**
     * 记录错误
     * @param type 错误类型
     * @param message 错误消息
     * @param details 错误详情
     * @param recoverable 是否可恢复
     */
    logError(type: ErrorType, message: string, details?: any, recoverable = true): void {
        const error: AppError = {
            type,
            message,
            details,
            timestamp: Date.now(),
            recoverable,
        };

        this.errors.push(error);

        // 限制错误记录数量
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // 输出到控制台
        if (recoverable) {
            console.warn(`[${type}] ${message}`, details);
        } else {
            console.error(`[${type}] ${message}`, details);
        }

        // 触发回调
        this.errorCallbacks.forEach((callback) => {
            try {
                callback(error);
            } catch (err) {
                console.error('Error in error callback:', err);
            }
        });
    }

    /**
     * 注册错误回调
     * @param callback 回调函数
     * @returns 取消注册函数
     */
    onError(callback: (error: AppError) => void): () => void {
        this.errorCallbacks.push(callback);
        return () => {
            const index = this.errorCallbacks.indexOf(callback);
            if (index !== -1) {
                this.errorCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * 获取所有错误
     * @returns 错误数组
     */
    getAllErrors(): AppError[] {
        return [...this.errors];
    }

    /**
     * 获取最近的错误
     * @param count 数量
     * @returns 错误数组
     */
    getRecentErrors(count = 10): AppError[] {
        return this.errors.slice(-count);
    }

    /**
     * 清除所有错误
     */
    clearErrors(): void {
        this.errors = [];
        console.log('All errors cleared');
    }

    /**
     * 获取错误数量
     * @returns 错误数量
     */
    getErrorCount(): number {
        return this.errors.length;
    }

    /**
     * 导出错误日志
     * @returns 错误日志字符串
     */
    exportErrorLog(): string {
        const log = this.errors.map((error) => {
            const date = new Date(error.timestamp).toISOString();
            return `[${date}] [${error.type}] ${error.message}\n${error.details ? JSON.stringify(error.details, null, 2) : ''
                }\n`;
        });

        return log.join('\n---\n\n');
    }

    /**
     * 处理异步错误
     * @param promise Promise 对象
     * @param errorType 错误类型
     * @param errorMessage 错误消息
     * @returns Promise
     */
    async handleAsync<T>(
        promise: Promise<T>,
        errorType: ErrorType,
        errorMessage: string
    ): Promise<T | null> {
        try {
            return await promise;
        } catch (error) {
            this.logError(errorType, errorMessage, error, true);
            return null;
        }
    }

    /**
     * 包装函数以自动处理错误
     * @param func 函数
     * @param errorType 错误类型
     * @param errorMessage 错误消息
     * @returns 包装后的函数
     */
    wrap<T extends (...args: any[]) => any>(
        func: T,
        errorType: ErrorType,
        errorMessage: string
    ): (...args: Parameters<T>) => ReturnType<T> | null {
        return (...args: Parameters<T>) => {
            try {
                return func(...args);
            } catch (error) {
                this.logError(errorType, errorMessage, error, true);
                return null;
            }
        };
    }
}

/**
 * Toast 通知管理器
 */
export class ToastManager {
    private toasts: Array<{
        id: string;
        type: 'success' | 'error' | 'warning' | 'info';
        message: string;
        duration: number;
    }> = [];
    private toastCallbacks: Array<(toast: any) => void> = [];

    /**
     * 显示成功提示
     * @param message 消息
     * @param duration 持续时间（毫秒）
     */
    success(message: string, duration = 3000): void {
        this.show('success', message, duration);
    }

    /**
     * 显示错误提示
     * @param message 消息
     * @param duration 持续时间（毫秒）
     */
    error(message: string, duration = 5000): void {
        this.show('error', message, duration);
    }

    /**
     * 显示警告提示
     * @param message 消息
     * @param duration 持续时间（毫秒）
     */
    warning(message: string, duration = 4000): void {
        this.show('warning', message, duration);
    }

    /**
     * 显示信息提示
     * @param message 消息
     * @param duration 持续时间（毫秒）
     */
    info(message: string, duration = 3000): void {
        this.show('info', message, duration);
    }

    /**
     * 显示提示
     * @param type 类型
     * @param message 消息
     * @param duration 持续时间
     */
    private show(
        type: 'success' | 'error' | 'warning' | 'info',
        message: string,
        duration: number
    ): void {
        const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const toast = { id, type, message, duration };

        this.toasts.push(toast);

        // 触发回调
        this.toastCallbacks.forEach((callback) => {
            try {
                callback(toast);
            } catch (error) {
                console.error('Error in toast callback:', error);
            }
        });

        // 自动移除
        setTimeout(() => {
            this.remove(id);
        }, duration);

        console.log(`[Toast ${type}] ${message}`);
    }

    /**
     * 移除提示
     * @param id 提示 ID
     */
    remove(id: string): void {
        const index = this.toasts.findIndex((t) => t.id === id);
        if (index !== -1) {
            this.toasts.splice(index, 1);
        }
    }

    /**
     * 注册提示回调
     * @param callback 回调函数
     * @returns 取消注册函数
     */
    onToast(callback: (toast: any) => void): () => void {
        this.toastCallbacks.push(callback);
        return () => {
            const index = this.toastCallbacks.indexOf(callback);
            if (index !== -1) {
                this.toastCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * 清除所有提示
     */
    clearAll(): void {
        this.toasts = [];
    }
}

/**
 * 对话框管理器
 */
export class DialogManager {
    /**
     * 显示确认对话框
     * @param title 标题
     * @param message 消息
     * @returns Promise<boolean>
     */
    async confirm(
        title: string,
        message: string
    ): Promise<boolean> {
        // 这里应该显示实际的对话框组件
        // 暂时使用浏览器原生对话框
        return window.confirm(`${title}\n\n${message}`);
    }

    /**
     * 显示警告对话框
     * @param title 标题
     * @param message 消息
     */
    async alert(title: string, message: string): Promise<void> {
        // 这里应该显示实际的对话框组件
        // 暂时使用浏览器原生对话框
        window.alert(`${title}\n\n${message}`);
    }

    /**
     * 显示输入对话框
     * @param title 标题
     * @param message 消息
     * @param defaultValue 默认值
     * @returns Promise<string | null>
     */
    async prompt(title: string, message: string, defaultValue = ''): Promise<string | null> {
        // 这里应该显示实际的对话框组件
        // 暂时使用浏览器原生对话框
        return window.prompt(`${title}\n\n${message}`, defaultValue);
    }
}

// 导出单例实例
export const errorHandler = new ErrorHandler();
export const toastManager = new ToastManager();
export const dialogManager = new DialogManager();

// 全局错误处理
window.addEventListener('error', (event) => {
    errorHandler.logError(
        ErrorType.CANVAS_RENDER_FAILED,
        'Uncaught error',
        {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error,
        },
        false
    );
});

window.addEventListener('unhandledrejection', (event) => {
    errorHandler.logError(
        ErrorType.CANVAS_RENDER_FAILED,
        'Unhandled promise rejection',
        {
            reason: event.reason,
        },
        false
    );
});
