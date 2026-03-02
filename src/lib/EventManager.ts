import type { EventType, EventPayload } from '../types';

/**
 * 事件管理器类
 * 负责模块间的事件通信
 */
export class EventManager {
    private listeners: Map<EventType, Set<(payload?: EventPayload) => void>> = new Map();
    private onceListeners: Map<EventType, Set<(payload?: EventPayload) => void>> = new Map();

    /**
     * 发布事件
     * @param event 事件类型
     * @param payload 事件负载
     */
    emit(event: EventType, payload?: EventPayload): void {
        // 触发普通监听器
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }

        // 触发一次性监听器
        const onceHandlers = this.onceListeners.get(event);
        if (onceHandlers) {
            onceHandlers.forEach((handler) => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`Error in once event handler for ${event}:`, error);
                }
            });
            // 清除一次性监听器
            this.onceListeners.delete(event);
        }

        console.log(`Event emitted: ${event}`, payload);
    }

    /**
     * 订阅事件
     * @param event 事件类型
     * @param handler 事件处理函数
     * @returns 取消订阅函数
     */
    on(event: EventType, handler: (payload?: EventPayload) => void): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        this.listeners.get(event)!.add(handler);
        console.log(`Event listener added for: ${event}`);

        // 返回取消订阅函数
        return () => this.off(event, handler);
    }

    /**
     * 订阅一次性事件
     * @param event 事件类型
     * @param handler 事件处理函数
     */
    once(event: EventType, handler: (payload?: EventPayload) => void): void {
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, new Set());
        }

        this.onceListeners.get(event)!.add(handler);
        console.log(`Once event listener added for: ${event}`);
    }

    /**
     * 取消订阅
     * @param event 事件类型
     * @param handler 事件处理函数
     */
    off(event: EventType, handler: (payload?: EventPayload) => void): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.delete(handler);
            console.log(`Event listener removed for: ${event}`);

            // 如果没有监听器了，删除事件
            if (handlers.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    /**
     * 清除所有监听器
     * @param event 事件类型（可选，不传则清除所有）
     */
    clear(event?: EventType): void {
        if (event) {
            this.listeners.delete(event);
            this.onceListeners.delete(event);
            console.log(`All listeners cleared for: ${event}`);
        } else {
            this.listeners.clear();
            this.onceListeners.clear();
            console.log('All event listeners cleared');
        }
    }

    /**
     * 获取事件的监听器数量
     * @param event 事件类型
     * @returns 监听器数量
     */
    getListenerCount(event: EventType): number {
        const handlers = this.listeners.get(event);
        const onceHandlers = this.onceListeners.get(event);
        return (handlers?.size || 0) + (onceHandlers?.size || 0);
    }

    /**
     * 检查是否有监听器
     * @param event 事件类型
     * @returns 是否有监听器
     */
    hasListeners(event: EventType): boolean {
        return this.getListenerCount(event) > 0;
    }

    /**
     * 获取所有事件类型
     * @returns 事件类型数组
     */
    getAllEvents(): EventType[] {
        const events = new Set<EventType>();
        this.listeners.forEach((_, event) => events.add(event));
        this.onceListeners.forEach((_, event) => events.add(event));
        return Array.from(events);
    }
}

// 导出单例实例
export const eventManager = new EventManager();
