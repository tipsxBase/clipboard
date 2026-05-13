/**
 * ResizeHandles - Transparent resize hot-zones for frameless window
 *
 * Renders 8 invisible hit-areas (4 edges + 4 corners) overlaid on the window.
 * Each area calls Tauri v2 `startResizeDragging(direction)` on mousedown.
 */
import { useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

interface HandleProps {
  direction: ResizeDirection;
  style: React.CSSProperties;
  cursor: string;
}

function ResizeHandle({ direction, style, cursor }: HandleProps) {
  const handleMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      await getCurrentWindow().startResizeDragging(direction);
    },
    [direction]
  );

  return (
    <div
      style={{ ...style, cursor, pointerEvents: 'auto', position: 'fixed', zIndex: 9998 }}
      onMouseDown={handleMouseDown}
    />
  );
}

export function ResizeHandles() {
  const edge = 4; // edge thickness in px
  const corner = 12; // corner size in px

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        // Ensure it sits above content but below modals (z-index 9999 reserved)
      }}
    >
      {/* Corners (rendered first so they take priority over edges) */}
      {/* NW */}
      <ResizeHandle
        direction="NorthWest"
        cursor="nw-resize"
        style={{ top: 0, left: 0, width: corner, height: corner }}
      />
      {/* NE */}
      <ResizeHandle
        direction="NorthEast"
        cursor="ne-resize"
        style={{ top: 0, right: 0, width: corner, height: corner }}
      />
      {/* SE */}
      <ResizeHandle
        direction="SouthEast"
        cursor="se-resize"
        style={{ bottom: 0, right: 0, width: corner, height: corner }}
      />
      {/* SW */}
      <ResizeHandle
        direction="SouthWest"
        cursor="sw-resize"
        style={{ bottom: 0, left: 0, width: corner, height: corner }}
      />

      {/* Edges */}
      {/* North */}
      <ResizeHandle
        direction="North"
        cursor="n-resize"
        style={{ top: 0, left: corner, right: corner, height: edge }}
      />
      {/* South */}
      <ResizeHandle
        direction="South"
        cursor="s-resize"
        style={{ bottom: 0, left: corner, right: corner, height: edge }}
      />
      {/* West */}
      <ResizeHandle
        direction="West"
        cursor="w-resize"
        style={{ left: 0, top: corner, bottom: corner, width: edge }}
      />
      {/* East */}
      <ResizeHandle
        direction="East"
        cursor="e-resize"
        style={{ right: 0, top: corner, bottom: corner, width: edge }}
      />
    </div>
  );
}
