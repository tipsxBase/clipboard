/**
 * HighlightText Component - React version
 *
 * Highlights search query matches in text with regex or plain text support.
 */
import { useMemo } from 'react';

export interface HighlightTextProps {
  text: string;
  query: string;
  isRegex?: boolean;
  isCaseSensitive?: boolean;
}

export function HighlightText({
  text,
  query,
  isRegex = false,
  isCaseSensitive = false,
}: HighlightTextProps) {
  const parts = useMemo(() => {
    if (!query) return [{ text, highlight: false }];

    try {
      let regex: RegExp;
      if (isRegex) {
        regex = new RegExp(`(${query})`, isCaseSensitive ? 'g' : 'gi');
      } else {
        // Escape special characters for regex
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(`(${escaped})`, isCaseSensitive ? 'g' : 'gi');
      }

      // Split keeps capturing groups in the result array
      const split = text.split(regex);

      return split
        .map((part, index) => ({
          text: part,
          highlight: index % 2 === 1 && part.length > 0,
        }))
        .filter((p) => p.text.length > 0);
    } catch {
      // If regex is invalid, return original text
      return [{ text, highlight: false }];
    }
  }, [text, query, isRegex, isCaseSensitive]);

  return (
    <span>
      {parts.map((part, i) =>
        part.highlight ? (
          <span
            key={i}
            className="bg-yellow-500/30 text-foreground box-decoration-clone rounded-[2px] px-0.5"
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

export default HighlightText;