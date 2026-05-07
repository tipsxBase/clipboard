/**
 * Debug state for screenshot tools
 * Used to display debug info in the UI panel
 */

interface DebugState {
  lastDrawStart: { x: number; y: number } | null;
  lastDrawCurrent: { x: number; y: number } | null;
  lastBlurData: any | null;
  lastBlurCoords: { left: number; top: number; w: number; h: number } | null;
  lastBlurCanvas: { width: number; height: number } | null;
  lastImageData: { left: number; top: number; w: number; h: number } | null;
  lastRegistryBg: { width: number; height: number } | null;
  lastRegistryOffset: { x: number; y: number } | null;
}

export const debugState: DebugState = {
  lastDrawStart: null,
  lastDrawCurrent: null,
  lastBlurData: null,
  lastBlurCoords: null,
  lastBlurCanvas: null,
  lastImageData: null,
  lastRegistryBg: null,
  lastRegistryOffset: null,
};

export function setDebugState(key: keyof DebugState, value: any) {
  debugState[key] = value;
}