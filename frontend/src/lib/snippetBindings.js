export const SUPPORTED_LANGUAGES = Object.freeze([
  "go",
  "shell",
  "sql",
  "yaml",
  "xml",
  "javascript",
  "css",
  "python"
]);

/**
 * Keep only positive integers from a line-numbers array.
 * Zero, negatives, floats, non-numbers, and missing values are dropped.
 */
export function normalizeLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Resolve a snippet and the lines that should be highlighted for the current
 * semantic step. If the codeRef is missing or malformed, the first snippet is
 * used as a safe fallback and a visible diagnostic is returned.
 *
 * @param {Array<{
 *   id: string,
 *   language: string,
 *   code: string,
 *   annotations?: Array<{line: number, text: string}>
 * }>} snippets
 * @param {{snippetId?: string, id?: string, lines?: number[], highlightLines?: number[]}|null} codeRef
 * @returns {{
 *   snippet: object | null,
 *   lines: number[],
 *   error: string | null
 * }}
 */
export function resolveSnippet(snippets, codeRef) {
  if (!Array.isArray(snippets)) {
    return { snippet: null, lines: [], error: "No snippets provided" };
  }

  const safeRef = codeRef && typeof codeRef === "object" ? codeRef : {};
  const requestedId =
    typeof safeRef.snippetId === "string" ? safeRef.snippetId
    : typeof safeRef.id === "string" ? safeRef.id
    : null;

  const requestedLines = normalizeLines(safeRef.lines ?? safeRef.highlightLines);

  let snippet = null;
  if (requestedId) {
    snippet = snippets.find((s) => s && s.id === requestedId) || null;
  }
  if (!snippet) {
    snippet = snippets[0] || null;
  }

  if (!snippet) {
    return { snippet: null, lines: [], error: `Snippet reference ${requestedId ?? "undefined"} not found` };
  }

  const lineCount = typeof snippet.code === "string" ? snippet.code.split("\n").length : 0;
  const validLines = [];
  const outOfRange = [];

  for (const line of requestedLines) {
    if (line <= lineCount) {
      validLines.push(line);
    } else {
      outOfRange.push(line);
    }
  }

  let error = null;
  if (!requestedId && !codeRef) {
    error = "No snippet reference provided; showing first snippet";
  } else if (requestedId && snippet.id !== requestedId) {
    error = `Snippet reference ${requestedId} not found`;
  }
  if (outOfRange.length > 0) {
    error = error ? `${error}. Lines out of range: ${outOfRange.join(", ")}` : `Lines out of range: ${outOfRange.join(", ")}`;
  }

  return { snippet, lines: validLines, error };
}

/**
 * Return the annotations that apply to a set of active lines, or all
 * annotations if no lines are active.
 *
 * @param {object} snippet
 * @param {number[]} activeLines
 * @returns {Array<{line: number, text: string}>}
 */
export function activeAnnotations(snippet, activeLines) {
  if (!snippet || !Array.isArray(snippet.annotations)) return [];
  const lineSet = new Set(activeLines);
  if (lineSet.size === 0) return snippet.annotations;
  return snippet.annotations.filter((a) => a && lineSet.has(a.line));
}
