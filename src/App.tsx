import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TooltipProvider } from '@/components/ui/tooltip';
import MainWindow from './features/main/pages/MainWindow';
import PopupWindow from './features/popup/pages/PopupWindow';
import ScreenshotWindow from './features/screenshot/pages/ScreenshotWindow';
import { ResizeHandles } from './features/main/components/ResizeHandles';

type WindowType = 'main' | 'popup' | 'screenshot' | null;

export default function App() {
  const [windowType, setWindowType] = useState<WindowType>(null);

  useEffect(() => {
    const detectWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        const label = appWindow.label;

        if (label === 'main') {
          setWindowType('main');
        } else if (label === 'popup') {
          setWindowType('popup');
        } else if (label.startsWith('screenshot')) {
          setWindowType('screenshot');
        } else {
          // Default to main window
          setWindowType('main');
        }
      } catch (e) {
        console.error('Failed to get window label:', e);
        setWindowType('main');
      }
    };

    detectWindow();
  }, []);

  // Loading state
  if (windowType === null) {
    return null;
  }

  // Route to correct window component
  const renderWindow = () => {
    switch (windowType) {
      case 'main':
        return <MainWindow />;
      case 'popup':
        return <PopupWindow />;
      case 'screenshot':
        return <ScreenshotWindow />;
      default:
        return <MainWindow />;
    }
  };

  return (
    <TooltipProvider>
      {renderWindow()}
      {windowType === 'main' && <ResizeHandles />}
    </TooltipProvider>
  );
}
