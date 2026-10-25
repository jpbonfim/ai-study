import matter from 'gray-matter';

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Splits a study document into its YAML frontmatter and markdown body. */
export function parseDocument(raw: string): ParsedDocument {
  const { data, content } = matter(raw);
  return { frontmatter: data, body: content };
}
