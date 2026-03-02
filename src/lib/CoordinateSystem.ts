import type { ScreenInfo, Point, Rectangle } from '../types';

/**
 * 坐标系统类
 * 负责处理逻辑像素和物理像素之间的转换
 */
export class CoordinateSystem {
    private screens: Map<number, ScreenInfo> = new Map();

    /**
     * 初始化屏幕信息
     * @param screens 屏幕信息数组
     */
    initScreens(screens: ScreenInfo[]): void {
        this.screens.clear();
        screens.forEach((screen) => {
            this.screens.set(screen.index, screen);
        });
    }

    /**
     * 逻辑像素转物理像素
     * @param point 逻辑坐标点
     * @param screenIndex 屏幕索引
     * @returns 物理坐标点
     */
    logicalToPhysical(point: Point, screenIndex: number): Point {
        const screen = this.screens.get(screenIndex);
        if (!screen) {
            console.warn(`Screen ${screenIndex} not found, returning original point`);
            return { ...point };
        }

        return {
            x: Math.round(point.x * screen.scaleFactor),
            y: Math.round(point.y * screen.scaleFactor),
        };
    }

    /**
     * 物理像素转逻辑像素
     * @param point 物理坐标点
     * @param screenIndex 屏幕索引
     * @returns 逻辑坐标点
     */
    physicalToLogical(point: Point, screenIndex: number): Point {
        const screen = this.screens.get(screenIndex);
        if (!screen) {
            console.warn(`Screen ${screenIndex} not found, returning original point`);
            return { ...point };
        }

        return {
            x: point.x / screen.scaleFactor,
            y: point.y / screen.scaleFactor,
        };
    }

    /**
     * 逻辑矩形转物理矩形
     * @param rect 逻辑矩形
     * @param screenIndex 屏幕索引
     * @returns 物理矩形
     */
    logicalRectToPhysical(rect: Rectangle, screenIndex: number): Rectangle {
        const screen = this.screens.get(screenIndex);
        if (!screen) {
            console.warn(`Screen ${screenIndex} not found, returning original rect`);
            return { ...rect };
        }

        return {
            x: Math.round(rect.x * screen.scaleFactor),
            y: Math.round(rect.y * screen.scaleFactor),
            width: Math.round(rect.width * screen.scaleFactor),
            height: Math.round(rect.height * screen.scaleFactor),
        };
    }

    /**
     * 物理矩形转逻辑矩形
     * @param rect 物理矩形
     * @param screenIndex 屏幕索引
     * @returns 逻辑矩形
     */
    physicalRectToLogical(rect: Rectangle, screenIndex: number): Rectangle {
        const screen = this.screens.get(screenIndex);
        if (!screen) {
            console.warn(`Screen ${screenIndex} not found, returning original rect`);
            return { ...rect };
        }

        return {
            x: rect.x / screen.scaleFactor,
            y: rect.y / screen.scaleFactor,
            width: rect.width / screen.scaleFactor,
            height: rect.height / screen.scaleFactor,
        };
    }

    /**
     * 获取屏幕信息
     * @param screenIndex 屏幕索引
     * @returns 屏幕信息或 null
     */
    getScreenInfo(screenIndex: number): ScreenInfo | null {
        return this.screens.get(screenIndex) || null;
    }

    /**
     * 获取所有屏幕信息
     * @returns 屏幕信息数组
     */
    getAllScreens(): ScreenInfo[] {
        return Array.from(this.screens.values());
    }

    /**
     * 根据逻辑坐标查找所属屏幕
     * @param point 逻辑坐标点
     * @returns 屏幕信息或 null
     */
    findScreenByLogicalPoint(point: Point): ScreenInfo | null {
        for (const screen of this.screens.values()) {
            if (
                point.x >= screen.x &&
                point.x < screen.x + screen.width &&
                point.y >= screen.y &&
                point.y < screen.y + screen.height
            ) {
                return screen;
            }
        }
        return null;
    }

    /**
     * 清除所有屏幕信息
     */
    clear(): void {
        this.screens.clear();
    }
}

// 导出单例实例
export const coordinateSystem = new CoordinateSystem();
