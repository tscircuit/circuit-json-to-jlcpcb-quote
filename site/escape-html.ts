/** A character that has meaning in HTML */
type HtmlSpecialCharacter = string

const HTML_ESCAPES: Record<HtmlSpecialCharacter, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Part descriptions and file names come from outside: escape before use. */
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
