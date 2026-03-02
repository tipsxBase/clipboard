import type { AnnotationTool, AnnotationStyle, Annotation, Rectangle } from '../types';

/**
 * 标注管理器类
 * 负责管理所有标注工具和标注对象
 */
export class AnnotationManager {
    private activeTool: AnnotationTool = null;
    private annotations: Map<string, Annotation> = new Map();
    private currentStyle: AnnotationStyle = {
        strokeColor: '#ff0000',
        strokeWidth: 2,
        fillColor: 'transparent',
        fontSize: 16,
        fontStyle: 'normal',
        arrowStyle: 'single',
        mosaicSize: 10,
        blurStrength: 5,
    };

    /**
     * 设置当前工具
     * @param tool 工具类型
     */
    setActiveTool(tool: AnnotationTool): void {
        this.activeTool = tool;
        console.log(`Active tool set to: ${tool}`);
    }

    /**
     * 获取当前工具
     * @returns 当前工具类型
     */
    getActiveTool(): AnnotationTool {
        return this.activeTool;
    }

    /**
     * 创建标注对象
     * @param type 标注类型
     * @param data 标注数据
     * @param style 标注样式
     * @returns 创建的标注对象
     */
    createAnnotation(type: AnnotationTool, data: any, style: AnnotationStyle): Annotation {
        const id = this.generateId();
        const annotation: Annotation = {
            id,
            type,
            data,
            style: { ...style },
            createdAt: Date.now(),
        };

        this.annotations.set(id, annotation);
        console.log(`Annotation created: ${id} (${type})`);

        return annotation;
    }

    /**
     * 更新标注对象
     * @param id 标注 ID
     * @param data 新的标注数据
     */
    updateAnnotation(id: string, data: any): void {
        const annotation = this.annotations.get(id);
        if (!annotation) {
            console.warn(`Annotation ${id} not found`);
            return;
        }

        annotation.data = data;
        console.log(`Annotation updated: ${id}`);
    }

    /**
     * 删除标注对象
     * @param id 标注 ID
     */
    deleteAnnotation(id: string): void {
        if (this.annotations.delete(id)) {
            console.log(`Annotation deleted: ${id}`);
        } else {
            console.warn(`Annotation ${id} not found`);
        }
    }

    /**
     * 获取所有标注对象
     * @returns 标注对象数组
     */
    getAllAnnotations(): Annotation[] {
        return Array.from(this.annotations.values());
    }

    /**
     * 清除所有标注
     */
    clearAll(): void {
        this.annotations.clear();
        console.log('All annotations cleared');
    }

    /**
     * 设置标注样式
     * @param style 部分样式
     */
    setStyle(style: Partial<AnnotationStyle>): void {
        this.currentStyle = { ...this.currentStyle, ...style };
        console.log('Annotation style updated:', this.currentStyle);
    }

    /**
     * 获取当前样式
     * @returns 当前样式
     */
    getStyle(): AnnotationStyle {
        return { ...this.currentStyle };
    }

    /**
     * 应用马赛克效果
     * @param ctx 画布上下文
     * @param region 区域
     * @param size 马赛克块大小
     */
    applyMosaic(
        ctx: CanvasRenderingContext2D,
        region: Rectangle,
        size: number
    ): void {
        const imageData = ctx.getImageData(region.x, region.y, region.width, region.height);
        const data = imageData.data;

        // 遍历每个马赛克块
        for (let y = 0; y < region.height; y += size) {
            for (let x = 0; x < region.width; x += size) {
                // 计算块的平均颜色
                let r = 0,
                    g = 0,
                    b = 0,
                    count = 0;

                for (let dy = 0; dy < size && y + dy < region.height; dy++) {
                    for (let dx = 0; dx < size && x + dx < region.width; dx++) {
                        const index = ((y + dy) * region.width + (x + dx)) * 4;
                        r += data[index];
                        g += data[index + 1];
                        b += data[index + 2];
                        count++;
                    }
                }

                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);

                // 填充块
                for (let dy = 0; dy < size && y + dy < region.height; dy++) {
                    for (let dx = 0; dx < size && x + dx < region.width; dx++) {
                        const index = ((y + dy) * region.width + (x + dx)) * 4;
                        data[index] = r;
                        data[index + 1] = g;
                        data[index + 2] = b;
                    }
                }
            }
        }

        ctx.putImageData(imageData, region.x, region.y);
        console.log('Mosaic applied to region:', region);
    }

    /**
     * 应用模糊效果
     * @param ctx 画布上下文
     * @param region 区域
     * @param strength 模糊强度
     */
    applyBlur(
        ctx: CanvasRenderingContext2D,
        region: Rectangle,
        strength: number
    ): void {
        const imageData = ctx.getImageData(region.x, region.y, region.width, region.height);
        const data = imageData.data;
        const tempData = new Uint8ClampedArray(data);

        const radius = Math.floor(strength);

        // 简单的盒式模糊
        for (let y = 0; y < region.height; y++) {
            for (let x = 0; x < region.width; x++) {
                let r = 0,
                    g = 0,
                    b = 0,
                    count = 0;

                // 采样周围像素
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;

                        if (nx >= 0 && nx < region.width && ny >= 0 && ny < region.height) {
                            const index = (ny * region.width + nx) * 4;
                            r += tempData[index];
                            g += tempData[index + 1];
                            b += tempData[index + 2];
                            count++;
                        }
                    }
                }

                const index = (y * region.width + x) * 4;
                data[index] = Math.floor(r / count);
                data[index + 1] = Math.floor(g / count);
                data[index + 2] = Math.floor(b / count);
            }
        }

        ctx.putImageData(imageData, region.x, region.y);
        console.log('Blur applied to region:', region);
    }

    /**
     * 绘制矩形
     * @param ctx 画布上下文
     * @param rect 矩形区域
     * @param style 样式
     */
    drawRect(ctx: CanvasRenderingContext2D, rect: Rectangle, style: AnnotationStyle): void {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

        if (style.fillColor && style.fillColor !== 'transparent') {
            ctx.fillStyle = style.fillColor;
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
    }

    /**
     * 绘制椭圆
     * @param ctx 画布上下文
     * @param rect 椭圆边界矩形
     * @param style 样式
     */
    drawEllipse(ctx: CanvasRenderingContext2D, rect: Rectangle, style: AnnotationStyle): void {
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const radiusX = Math.abs(rect.width / 2);
        const radiusY = Math.abs(rect.height / 2);

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);

        if (style.fillColor && style.fillColor !== 'transparent') {
            ctx.fillStyle = style.fillColor;
            ctx.fill();
        }

        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        ctx.stroke();
    }

    /**
     * 绘制箭头
     * @param ctx 画布上下文
     * @param start 起点
     * @param end 终点
     * @param style 样式
     */
    drawArrow(
        ctx: CanvasRenderingContext2D,
        start: { x: number; y: number },
        end: { x: number; y: number },
        style: AnnotationStyle
    ): void {
        const headLength = 15;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        // 绘制线条
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        ctx.stroke();

        // 绘制箭头头部
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
            end.x - headLength * Math.cos(angle - Math.PI / 6),
            end.y - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            end.x - headLength * Math.cos(angle + Math.PI / 6),
            end.y - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = style.strokeColor;
        ctx.fill();

        // 如果是双向箭头，绘制起点箭头
        if (style.arrowStyle === 'double') {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(
                start.x + headLength * Math.cos(angle - Math.PI / 6),
                start.y + headLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
                start.x + headLength * Math.cos(angle + Math.PI / 6),
                start.y + headLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fillStyle = style.strokeColor;
            ctx.fill();
        }
    }

    /**
     * 绘制文字
     * @param ctx 画布上下文
     * @param text 文字内容
     * @param position 位置
     * @param style 样式
     */
    drawText(
        ctx: CanvasRenderingContext2D,
        text: string,
        position: { x: number; y: number },
        style: AnnotationStyle
    ): void {
        const fontSize = style.fontSize || 16;
        const fontStyle = style.fontStyle || 'normal';

        ctx.font = `${fontStyle} ${fontSize}px sans-serif`;
        ctx.fillStyle = style.strokeColor;
        ctx.fillText(text, position.x, position.y);
    }

    /**
     * 生成唯一 ID
     * @returns 唯一 ID
     */
    private generateId(): string {
        return `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取标注数量
     * @returns 标注数量
     */
    getAnnotationCount(): number {
        return this.annotations.size;
    }
}

// 导出单例实例
export const annotationManager = new AnnotationManager();
