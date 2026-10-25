import createDOMPurify, { type Config, type WindowLike } from 'dompurify';

/**
 * Sanitization profile for rendered study content.
 *
 * Content is written by users (and by LLM skills) and may be shared between users, so every
 * rendered HTML fragment goes through DOMPurify before it reaches a page. The profile keeps what
 * the renderer legitimately produces: KaTeX markup (inline styles), Shiki tokens (CSS variables),
 * anchors with ids, block diagram SVGs whose labels live in `<foreignObject>`, and data attributes
 * used by the client-side enhancers.
 */
const CONTENT_PROFILE: Config = {
  // semantics/annotation: KaTeX MathML (screen-reader markup) produced for block diagram labels.
  ADD_TAGS: ['foreignObject', 'semantics', 'annotation'],
  ADD_ATTR: ['target', 'tabindex'],
  // Block diagram labels are XHTML (KaTeX) inside SVG <foreignObject>.
  HTML_INTEGRATION_POINTS: { 'annotation-xml': true, foreignobject: true },
};

export type HtmlSanitizer = (html: string) => string;

export function createHtmlSanitizer(window: WindowLike): HtmlSanitizer {
  const purify = createDOMPurify(window);
  return (html) => purify.sanitize(html, CONTENT_PROFILE) as string;
}
