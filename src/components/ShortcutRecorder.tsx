/**
 * ShortcutRecorder - React Component
 *
 * A component for recording keyboard shortcuts with real-time display.
 *
 * Interaction:
 * - Click input → starts recording, shows "Press shortcut..."
 * - Press keys → shows real-time key combination
 * - ESC → cancels recording (stops propagation to prevent closing dialog)
 * - Enter or release key → confirms and saves
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

// Key name mapping for display
const KEY_NAMES: Record<string, string> = {
  Meta: 'Cmd',
  OS: 'Cmd',
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: 'Del',
  Enter: '↵',
  Tab: '⇥',
  Space: 'Space',
  Plus: '+',
  Minus: '-',
  Equal: '=',
};

// Convert key to display name
function formatKey(key: string): string {
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return KEY_NAMES[key] || key;
}

// Format shortcut string for display
function formatShortcutForDisplay(shortcut: string): string {
  return shortcut
    .replace(/\+/g, ' + ')
    .replace(/CommandOrControl/g, 'Cmd')
    .replace(/Ctrl/g, 'Ctrl')
    .replace(/Alt/g, 'Alt')
    .replace(/Shift/g, 'Shift');
}

// Convert captured keys to Tauri shortcut format
function keysToShortcut(keys: Set<string>): string {
  const parts: string[] = [];
  const normalKeys: string[] = [];

  keys.forEach(key => {
    if (key === 'Meta' || key === 'OS') {
      parts.push('CommandOrControl');
    } else if (key === 'Control') {
      parts.push('Ctrl');
    } else if (key === 'Alt') {
      parts.push('Alt');
    } else if (key === 'Shift') {
      parts.push('Shift');
    } else {
      normalKeys.push(formatKey(key));
    }
  });

  if (parts.length === 0 || normalKeys.length === 0) {
    return '';
  }

  return [...parts, ...normalKeys].join('+');
}

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ShortcutRecorder({
  value,
  onChange,
  placeholder,
  disabled,
}: ShortcutRecorderProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [displayText, setDisplayText] = useState(value ? formatShortcutForDisplay(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Use native events in capture phase to intercept before Radix Dialog
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      // Stop all events during recording
      e.stopPropagation();
      e.preventDefault();

      // ESC cancels recording
      if (e.key === 'Escape') {
        setIsRecording(false);
        setPressedKeys(new Set());
        setDisplayText(value ? formatShortcutForDisplay(value) : '');
        return;
      }

      // Enter confirms current shortcut
      if (e.key === 'Enter') {
        const shortcut = keysToShortcut(pressedKeys);
        if (shortcut) {
          onChange(shortcut);
          setDisplayText(formatShortcutForDisplay(shortcut));
        }
        setIsRecording(false);
        setPressedKeys(new Set());
        return;
      }

      // Add key to set
      const newKeys = new Set(pressedKeys);
      newKeys.add(e.key);
      setPressedKeys(newKeys);

      // Update display
      const capturedKeys = Array.from(newKeys).map(formatKey);
      setDisplayText(capturedKeys.join(' + '));
    };

    const handleKeyUpCapture = (e: KeyboardEvent) => {
      // Stop all events during recording
      e.stopPropagation();

      // When a normal key is released, confirm shortcut
      if (!['Meta', 'OS', 'Control', 'Alt', 'Shift', 'Escape', 'Enter'].includes(e.key)) {
        const shortcut = keysToShortcut(pressedKeys);
        if (shortcut) {
          onChange(shortcut);
          setDisplayText(formatShortcutForDisplay(shortcut));
        }
        setIsRecording(false);
        setPressedKeys(new Set());
      }
    };

    // Add listeners in capture phase (before Radix Dialog handlers)
    document.addEventListener('keydown', handleKeyDownCapture, true);
    document.addEventListener('keyup', handleKeyUpCapture, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDownCapture, true);
      document.removeEventListener('keyup', handleKeyUpCapture, true);
    };
  }, [isRecording, pressedKeys, value, onChange]);

  // Start recording on focus
  const handleFocus = useCallback(() => {
    if (disabled) return;
    setIsRecording(true);
    setPressedKeys(new Set());
    setDisplayText(t('settings.pressShortcut'));
  }, [disabled, t]);

  // Cancel recording on blur (if not already confirmed)
  const handleBlur = useCallback(() => {
    if (isRecording) {
      const shortcut = keysToShortcut(pressedKeys);
      if (shortcut) {
        onChange(shortcut);
        setDisplayText(formatShortcutForDisplay(shortcut));
      } else {
        setDisplayText(value ? formatShortcutForDisplay(value) : '');
      }
      setIsRecording(false);
      setPressedKeys(new Set());
    }
  }, [isRecording, pressedKeys, value, onChange]);

  // Update display when value changes externally
  useEffect(() => {
    if (!isRecording) {
      setDisplayText(value ? formatShortcutForDisplay(value) : '');
    }
  }, [value, isRecording]);

  return (
    <Input
      ref={inputRef}
      value={displayText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      readOnly
      disabled={disabled}
      placeholder={placeholder || t('settings.clickToRecord')}
      className={`h-9 cursor-pointer ${isRecording ? 'ring-2 ring-ring ring-offset-1' : ''}`}
    />
  );
}

export default ShortcutRecorder;