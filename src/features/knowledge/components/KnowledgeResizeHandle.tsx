import { useCallback, useEffect, useRef } from 'react';

interface KnowledgeResizeHandleProps {
  onResize: (delta: number) => void;
}

export function KnowledgeResizeHandle({ onResize }: KnowledgeResizeHandleProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const pendingDelta = useRef(0);
  const rafId = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastX.current = e.clientX;
    pendingDelta.current = 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      pendingDelta.current += e.clientX - lastX.current;
      lastX.current = e.clientX;

      if (!rafId.current) {
        rafId.current = requestAnimationFrame(() => {
          if (pendingDelta.current !== 0) {
            onResize(pendingDelta.current);
            pendingDelta.current = 0;
          }
          rafId.current = 0;
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (rafId.current) {
          cancelAnimationFrame(rafId.current);
          rafId.current = 0;
        }
        if (pendingDelta.current !== 0) {
          onResize(pendingDelta.current);
          pendingDelta.current = 0;
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [onResize]);

  return (
    <div
      className="relative z-30 w-1 shrink-0 self-stretch cursor-col-resize bg-transparent transition-colors hover:bg-border"
      onMouseDown={handleMouseDown}
    />
  );
}
