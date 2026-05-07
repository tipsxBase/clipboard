import React from 'react';
import type { SelectionRect } from '../../../lib/screenshot/types';

interface SizeInfoProps {
  selection: SelectionRect;
  style?: React.CSSProperties;
}

export function SizeInfo({ selection, style }: SizeInfoProps) {
  const w = Math.round(selection.w);
  const h = Math.round(selection.h);
  return (
    <div
      className="absolute z-40 px-2 py-1 bg-black/80 text-white text-xs font-mono rounded pointer-events-none"
      style={style}
    >
      {w} × {h}
    </div>
  );
}
