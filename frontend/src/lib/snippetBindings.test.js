import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSnippet,
  normalizeLines,
  SUPPORTED_LANGUAGES
} from "./snippetBindings.js";

const SNIPPETS = Object.freeze([
  Object.freeze({ id: "send-loop", language: "go", code: "for _, job := range jobs {\n    queue <- job\n}", annotations: [{ line: 2, text: "Waits" }] }),
  Object.freeze({ id: "worker", language: "go", code: "go worker()", annotations: [] })
]);

describe("normalizeLines", () => {
  it("keeps positive integers and drops invalid values", () => {
    assert.deepStrictEqual(normalizeLines([1, 0, -1, 2, "a", 3.5, null]), [1, 2]);
  });

  it("returns empty array for non-array input", () => {
    assert.deepStrictEqual(normalizeLines(null), []);
    assert.deepStrictEqual(normalizeLines("1,2"), []);
  });
});

describe("resolveSnippet", () => {
  it("selects snippet by codeRef.snippetId", () => {
    const result = resolveSnippet(SNIPPETS, { snippetId: "worker", lines: [1] });
    assert.equal(result.snippet.id, "worker");
    assert.deepStrictEqual(result.lines, [1]);
    assert.equal(result.error, null);
  });

  it("selects snippet by codeRef.id as alias", () => {
    const result = resolveSnippet(SNIPPETS, { id: "worker" });
    assert.equal(result.snippet.id, "worker");
  });

  it("falls back to first snippet when codeRef is missing", () => {
    const result = resolveSnippet(SNIPPETS, null);
    assert.equal(result.snippet.id, "send-loop");
    assert.equal(result.error, "No snippet reference provided; showing first snippet");
  });

  it("reports missing snippet id and falls back to first snippet", () => {
    const result = resolveSnippet(SNIPPETS, { snippetId: "missing", lines: [1] });
    assert.equal(result.snippet.id, "send-loop");
    assert.equal(result.error, "Snippet reference missing not found");
  });

  it("filters out-of-range lines and reports them", () => {
    const result = resolveSnippet(SNIPPETS, { snippetId: "send-loop", lines: [1, 5, 2] });
    assert.deepStrictEqual(result.lines, [1, 2]);
    assert.equal(result.error, "Lines out of range: 5");
  });

  it("returns error when no snippets are provided", () => {
    const result = resolveSnippet(null, { snippetId: "a" });
    assert.equal(result.snippet, null);
    assert.equal(result.error, "No snippets provided");
  });

  it("treats requested line beyond actual line count as out of range", () => {
    const result = resolveSnippet([{ id: "one-line", language: "go", code: "one" }], { lines: [1, 2] });
    assert.deepStrictEqual(result.lines, [1]);
    assert.equal(result.error, "Lines out of range: 2");
  });
});

describe("SUPPORTED_LANGUAGES", () => {
  it("includes go and a bounded set of common languages", () => {
    assert.ok(SUPPORTED_LANGUAGES.includes("go"));
    assert.ok(SUPPORTED_LANGUAGES.includes("sql"));
    assert.ok(SUPPORTED_LANGUAGES.includes("shell"));
  });
});
