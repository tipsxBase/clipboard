/**
 * Clipboard code block highlight options.
 *
 * Uses BlockNote's built-in Shiki support with default configuration.
 */

import { codeBlockOptions } from '@blocknote/code-block';
import type { CodeBlockOptions } from '@blocknote/core';

/** True when the engine supports Shiki's required regex features. */
export function supportsShikiRegex(): boolean {
  try {
    new RegExp('', 'd');
    new RegExp('[[]]', 'v');
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns code block options with:
 * - BlockNote's default Shiki highlighter (github-dark theme)
 * - `text` as the default language
 */
export function createClipboardCodeBlockOptions(): Partial<CodeBlockOptions> {
  if (!supportsShikiRegex()) {
    return { defaultLanguage: 'text' };
  }

  return {
    ...codeBlockOptions,
    defaultLanguage: 'text',
  };
}
