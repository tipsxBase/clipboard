/**
 * Wikilink utilities for KnowledgeDetailPanel.
 *
 * Strategy: BlockNote's Markdown parser does not understand [[target]] syntax.
 * Before feeding markdown into BlockNote we replace [[target]] with a unicode
 * placeholder ‹WL:target›. When serialising BlockNote output back to markdown
 * we restore the placeholder to [[target]].
 *
 * The placeholder uses rare Unicode angle-quote characters (U+2039 / U+203A)
 * combined with a "WL:" prefix so they are extremely unlikely to appear in
 * normal user content.
 */

const WL_OPEN = '\u2039WL:';
const WL_CLOSE = '\u203A';

/** Replace [[target]] → ‹WL:target› before feeding to BlockNote */
export function encodeWikilinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_match, target) => {
    return `${WL_OPEN}${target}${WL_CLOSE}`;
  });
}

/** Replace ‹WL:target› → [[target]] after serialising from BlockNote */
export function decodeWikilinks(markdown: string): string {
  const escapedOpen = WL_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedClose = WL_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown.replace(
    new RegExp(`${escapedOpen}([^${WL_CLOSE}]+)${escapedClose}`, 'g'),
    (_match, target) => `[[${target}]]`
  );
}

/** Extract all wikilink targets from raw markdown */
export function extractWikilinkTargets(markdown: string): string[] {
  const results: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    results.push(m[1]);
  }
  return results;
}
