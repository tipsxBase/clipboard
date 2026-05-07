import React, { useRef, useEffect } from 'react';
import type { PixelColor, Point } from '../../../lib/screenshot/types';

interface MagnifierProps {
  bgCanvas: HTMLCanvasElement | null;
  mousePos: Point;
  pixelColor: PixelColor;
  scaleFactor: { x: number; y: number };
  /** 绝对定位偏移 */
  style?: React.CSSProperties;
}

const SIZE = 120;
const SAMPLE_RADIUS = 15;

export function Magnifier({ bgCanvas, mousePos, pixelColor, scaleFactor, style }: MagnifierProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const px = mousePos.x * scaleFactor.x;
    const py = mousePos.y * scaleFactor.y;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      bgCanvas,
      px - SAMPLE_RADIUS,
      py - SAMPLE_RADIUS,
      SAMPLE_RADIUS * 2,
      SAMPLE_RADIUS * 2,
      0,
      0,
      SIZE,
      SIZE
    );

    // 中心十字线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2, 0);
    ctx.lineTo(SIZE / 2, SIZE);
    ctx.moveTo(0, SIZE / 2);
    ctx.lineTo(SIZE, SIZE / 2);
    ctx.stroke();

    // 中心红点
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [bgCanvas, mousePos, scaleFactor]);

  return (
    <div
      className="absolute z-40 pointer-events-none rounded overflow-hidden shadow-lg"
      style={style}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="block" />
      <div className="bg-black/90 text-white text-xs px-2 py-1 font-mono">
        <div>
          {Math.round(mousePos.x)}, {Math.round(mousePos.y)}
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded border border-white/50 flex-shrink-0"
            style={{ backgroundColor: pixelColor.hex }}
          />
          <span>{pixelColor.hex.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
