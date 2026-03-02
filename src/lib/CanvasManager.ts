import type { SelectionRegion, Point, ColorInfo } from '../types';

/**
 * 画布管理器类
 * 负责管理截图画布的渲染和交互
 */
export class CanvasManager {
    private backgroundCanvas: HTMLCanvasElement | null = null;
    private maskCanvas: HTMLCanvasElement | null = null;
    private annotationCanvas: HTMLCanvasElement | null = null;
    private magnifierCanvas: HTMLCanvasElement | null = null;

    private backgroundCtx: CanvasRenderingContext2D | null = null;
    private maskCtx: CanvasRenderingContext2D | null = null;
    private annotationCtx: CanvasRenderingContext2D | null = null;
    private magnifierCtx: CanvasRenderingContext2D | null = null;

    private offscreenCanvas: HTMLCanvasElement | null = null;
    private offscreenCtx: CanvasRenderingContext2D | null = null;

    private renderRequested = false;

    /**
     * 初始化画布
     * @param backgroundCanvas 背景画布
     * @param maskCanvas 遮罩画布
     * @param annotationCanvas 标注画布
     * @param magnifierCanvas 放大镜画布
     */
    initCanvas(
        backgroundCanvas: HTMLCanvasElement,
        maskCanvas: HTMLCanvasElement,
        annotationCanvas: HTMLCanvasElement,
        magnifierCanvas: HTMLCanvasElement
    ): void {
        this.backgroundCanvas = backgroundCanvas;
        this.maskCanvas = maskCanvas;
        this.annotationCanvas = annotationCanvas;
        this.magnifierCanvas = magnifierCanvas;

        // 获取上下文
        this.backgroundCtx = backgroundCanvas.getContext('2d', { willReadFrequently: true });
        this.maskCtx = maskCanvas.getContext('2d', { willReadFrequently: false });
        this.annotationCtx = annotationCanvas.getContext('2d', { willReadFrequently: false });
        this.magnifierCtx = magnifierCanvas.getContext('2d', { willReadFrequently: true });

        if (!this.backgroundCtx || !this.maskCtx || !this.annotationCtx || !this.magnifierCtx) {
            throw new Error('Failed to get canvas contexts');
        }

        // 创建离屏画布用于缓存背景
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = backgroundCanvas.width;
        this.offscreenCanvas.height = backgroundCanvas.height;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

        console.log('Canvas initialized');
    }

    /**
     * 设置背景图片
     * @param imageUrl 图片 URL
     */
    async setBackgroundImage(imageUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // 绘制到离屏画布
                if (this.offscreenCtx && this.offscreenCanvas) {
                    this.offscreenCtx.drawImage(img, 0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
                }

                // 绘制到背景画布
                if (this.backgroundCtx && this.backgroundCanvas) {
                    this.backgroundCtx.drawImage(img, 0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
                }

                console.log('Background image loaded');
                resolve();
            };
            img.onerror = () => {
                reject(new Error('Failed to load background image'));
            };
            img.src = imageUrl;
        });
    }

    /**
     * 渲染选区遮罩
     * @param selection 选区区域
     */
    renderMask(selection: SelectionRegion | null): void {
        if (!this.maskCtx || !this.maskCanvas) {
            return;
        }

        // 清除画布
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);

        if (!selection) {
            return;
        }

        // 绘制半透明遮罩
        this.maskCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.maskCtx.fillRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);

        // 清除选区部分
        this.maskCtx.clearRect(selection.x, selection.y, selection.width, selection.height);

        // 绘制选区边框
        this.maskCtx.strokeStyle = '#00a8ff';
        this.maskCtx.lineWidth = 2;
        this.maskCtx.strokeRect(selection.x, selection.y, selection.width, selection.height);

        // 绘制控制点
        this.drawControlPoints(selection);
    }

    /**
     * 绘制控制点
     * @param selection 选区区域
     */
    private drawControlPoints(selection: SelectionRegion): void {
        if (!this.maskCtx) {
            return;
        }

        const pointSize = 8;
        const points = [
            { x: selection.x, y: selection.y }, // 左上
            { x: selection.x + selection.width / 2, y: selection.y }, // 上中
            { x: selection.x + selection.width, y: selection.y }, // 右上
            { x: selection.x, y: selection.y + selection.height / 2 }, // 左中
            { x: selection.x + selection.width, y: selection.y + selection.height / 2 }, // 右中
            { x: selection.x, y: selection.y + selection.height }, // 左下
            { x: selection.x + selection.width / 2, y: selection.y + selection.height }, // 下中
            { x: selection.x + selection.width, y: selection.y + selection.height }, // 右下
        ];

        this.maskCtx.fillStyle = '#00a8ff';
        points.forEach((point) => {
            this.maskCtx!.fillRect(
                point.x - pointSize / 2,
                point.y - pointSize / 2,
                pointSize,
                pointSize
            );
        });
    }

    /**
     * 渲染放大镜
     * @param position 鼠标位置
     * @param visible 是否可见
     */
    renderMagnifier(position: Point, visible: boolean): void {
        if (!this.magnifierCtx || !this.magnifierCanvas || !visible) {
            if (this.magnifierCtx && this.magnifierCanvas) {
                this.magnifierCtx.clearRect(0, 0, this.magnifierCanvas.width, this.magnifierCanvas.height);
            }
            return;
        }

        const magnifierSize = 120;
        const zoomLevel = 3;
        const sourceSize = magnifierSize / zoomLevel;

        // 清除画布
        this.magnifierCtx.clearRect(0, 0, this.magnifierCanvas.width, this.magnifierCanvas.height);

        // 从离屏画布获取源区域
        if (this.offscreenCanvas && this.offscreenCtx) {
            const sourceX = Math.max(0, position.x - sourceSize / 2);
            const sourceY = Math.max(0, position.y - sourceSize / 2);

            // 绘制放大的图像
            this.magnifierCtx.drawImage(
                this.offscreenCanvas,
                sourceX,
                sourceY,
                sourceSize,
                sourceSize,
                position.x - magnifierSize / 2,
                position.y - magnifierSize / 2,
                magnifierSize,
                magnifierSize
            );

            // 绘制边框
            this.magnifierCtx.strokeStyle = '#00a8ff';
            this.magnifierCtx.lineWidth = 2;
            this.magnifierCtx.strokeRect(
                position.x - magnifierSize / 2,
                position.y - magnifierSize / 2,
                magnifierSize,
                magnifierSize
            );

            // 绘制十字线
            this.magnifierCtx.strokeStyle = '#ff0000';
            this.magnifierCtx.lineWidth = 1;
            this.magnifierCtx.beginPath();
            this.magnifierCtx.moveTo(position.x - 10, position.y);
            this.magnifierCtx.lineTo(position.x + 10, position.y);
            this.magnifierCtx.moveTo(position.x, position.y - 10);
            this.magnifierCtx.lineTo(position.x, position.y + 10);
            this.magnifierCtx.stroke();
        }
    }

    /**
     * 获取指定位置的像素颜色
     * @param position 位置
     * @returns 颜色信息
     */
    getPixelColor(position: Point): ColorInfo {
        if (!this.offscreenCtx || !this.offscreenCanvas) {
            return { r: 0, g: 0, b: 0, hex: '#000000' };
        }

        const imageData = this.offscreenCtx.getImageData(position.x, position.y, 1, 1);
        const data = imageData.data;

        const r = data[0];
        const g = data[1];
        const b = data[2];
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        return { r, g, b, hex };
    }

    /**
     * 清除所有画布
     */
    clearAll(): void {
        if (this.backgroundCtx && this.backgroundCanvas) {
            this.backgroundCtx.clearRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
        }
        if (this.maskCtx && this.maskCanvas) {
            this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        }
        if (this.annotationCtx && this.annotationCanvas) {
            this.annotationCtx.clearRect(0, 0, this.annotationCanvas.width, this.annotationCanvas.height);
        }
        if (this.magnifierCtx && this.magnifierCanvas) {
            this.magnifierCtx.clearRect(0, 0, this.magnifierCanvas.width, this.magnifierCanvas.height);
        }
    }

    /**
     * 导出选区图片为 DataURL
     * @param selection 选区区域
     * @returns DataURL
     */
    exportSelection(selection: SelectionRegion): string {
        if (!this.offscreenCanvas || !this.offscreenCtx) {
            throw new Error('Canvas not initialized');
        }

        // 创建临时画布
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = selection.width;
        tempCanvas.height = selection.height;
        const tempCtx = tempCanvas.getContext('2d');

        if (!tempCtx) {
            throw new Error('Failed to create temp canvas context');
        }

        // 复制选区内容
        tempCtx.drawImage(
            this.offscreenCanvas,
            selection.x,
            selection.y,
            selection.width,
            selection.height,
            0,
            0,
            selection.width,
            selection.height
        );

        // 如果有标注，也绘制标注
        if (this.annotationCanvas) {
            tempCtx.drawImage(
                this.annotationCanvas,
                selection.x,
                selection.y,
                selection.width,
                selection.height,
                0,
                0,
                selection.width,
                selection.height
            );
        }

        return tempCanvas.toDataURL('image/png');
    }

    /**
     * 获取画布尺寸
     * @returns 画布尺寸
     */
    getCanvasSize(): { width: number; height: number } {
        if (!this.backgroundCanvas) {
            return { width: 0, height: 0 };
        }
        return {
            width: this.backgroundCanvas.width,
            height: this.backgroundCanvas.height,
        };
    }

    /**
     * 请求渲染（使用 requestAnimationFrame 优化）
     * @param callback 渲染回调
     */
    requestRender(callback: () => void): void {
        if (this.renderRequested) {
            return;
        }

        this.renderRequested = true;
        requestAnimationFrame(() => {
            callback();
            this.renderRequested = false;
        });
    }

    /**
     * 获取标注画布上下文
     * @returns 标注画布上下文
     */
    getAnnotationContext(): CanvasRenderingContext2D | null {
        return this.annotationCtx;
    }

    /**
     * 获取标注画布
     * @returns 标注画布
     */
    getAnnotationCanvas(): HTMLCanvasElement | null {
        return this.annotationCanvas;
    }
}
