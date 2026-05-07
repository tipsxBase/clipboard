import React, { useRef, useEffect, useState } from 'react';
import type { DrawingConfig, Point } from '../../../lib/screenshot/types';

interface TextInputOverlayProps {
  pos: Point; // 物理像素坐标
  config: DrawingConfig;
  scaleFactor: { x: number; y: number };
  onComplete: (text: string) => void;
  onCancel: () => void;
}

export function TextInputOverlay({
  pos,
  config,
  scaleFactor,
  onComplete,
  onCancel,
}: TextInputOverlayProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 转换到逻辑像素坐标
  const logicalX = pos.x / scaleFactor.x;
  const logicalY = pos.y / scaleFactor.y;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onComplete(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="absolute z-60 pointer-events-auto"
      style={{ left: logicalX, top: logicalY }}
      data-no-interaction
      onMouseDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onComplete(value)}
        className="bg-transparent outline-none resize-none border-b border-dashed border-white min-w-[60px]"
        style={{
          color: config.strokeColor,
          fontSize: `${config.fontSize}px`,
          fontFamily: config.fontFamily,
          lineHeight: 1.2,
          caretColor: config.strokeColor,
        }}
        rows={3}
        placeholder="..."
      />
    </div>
  );
}
