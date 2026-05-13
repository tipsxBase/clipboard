import { useEffect, useState } from 'react';

/**
 * Tracks whether the page is in dark mode by watching the `dark` class on
 * <html>. Stays in sync with the app's theme system (useSettings → applyTheme).
 */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
