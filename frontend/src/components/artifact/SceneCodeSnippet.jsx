import { useEffect, useMemo, useRef, useState, useId } from "react";
import { EditorView, lineNumbers, Decoration, ViewPlugin } from "@codemirror/view";
import { EditorState, Compartment, RangeSetBuilder } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { go } from "@codemirror/legacy-modes/mode/go";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { sql } from "@codemirror/legacy-modes/mode/sql";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { xml } from "@codemirror/legacy-modes/mode/xml";
import { javascript } from "@codemirror/legacy-modes/mode/javascript";
import { css } from "@codemirror/legacy-modes/mode/css";
import { python } from "@codemirror/legacy-modes/mode/python";
import { resolveSnippet, activeAnnotations } from "../../lib/snippetBindings.js";

function languageModeFor(language) {
  if (!language || typeof language !== "string") return null;
  const lower = language.toLowerCase();
  switch (lower) {
    case "go":
      return StreamLanguage.define(go);
    case "shell":
    case "bash":
    case "sh":
      return StreamLanguage.define(shell);
    case "sql":
      return StreamLanguage.define(sql);
    case "yaml":
    case "yml":
      return StreamLanguage.define(yaml);
    case "xml":
    case "html":
      return StreamLanguage.define(xml);
    case "javascript":
    case "js":
    case "json":
      return StreamLanguage.define(javascript);
    case "css":
      return StreamLanguage.define(css);
    case "python":
    case "py":
      return StreamLanguage.define(python);
    default:
      return null;
  }
}

function highlightLinesExtension(lines) {
  const activeSet = new Set(lines);
  return ViewPlugin.fromClass(
    class HighlightActiveLines {
      constructor(view) {
        this.decorations = this.build(view);
      }
      update(update) {
        if (update.docChanged) this.decorations = this.build(update.view);
      }
      build(view) {
        const builder = new RangeSetBuilder();
        for (let i = 1; i <= view.state.doc.lines; i++) {
          if (activeSet.has(i)) {
            const line = view.state.doc.line(i);
            builder.add(line.from, line.from, Decoration.line({ class: "cm-snippet-active-line" }));
          }
        }
        return builder.finish();
      }
    },
    { decorations: (value) => value.decorations }
  );
}

const editorTheme = EditorView.theme({
  ".cm-editor": {
    background: "transparent",
    color: "var(--text-primary)"
  },
  ".cm-gutters": {
    background: "var(--surface-3)",
    color: "var(--text-muted)",
    border: "none",
    borderRight: "1px solid var(--border-mid)"
  },
  ".cm-content": {
    padding: "8px 0"
  },
  ".cm-line": {
    color: "var(--text-code)"
  },
  ".cm-snippet-active-line": {
    background: "var(--signal-mint-dim)"
  }
});

export default function SceneCodeSnippet({ snippets, codeRef }) {
  const parentRef = useRef(null);
  const viewRef = useRef(null);
  const languageCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const tabRefs = useRef([]);
  const panelId = useId();
  const [selectedId, setSelectedId] = useState(null);

  const { snippet, lines, error } = useMemo(
    () => resolveSnippet(snippets, codeRef),
    [snippets, codeRef]
  );

  useEffect(() => {
    if (snippet) setSelectedId(snippet.id);
  }, [snippet?.id]);

  const selectedSnippet = useMemo(
    () => snippets.find((s) => s && s.id === selectedId) || snippet,
    [snippets, selectedId, snippet]
  );

  const activeLines = useMemo(() => {
    if (!selectedSnippet || !snippet) return [];
    return selectedSnippet.id === snippet.id ? lines : [];
  }, [selectedSnippet, snippet, lines]);

  const annotations = useMemo(
    () => activeAnnotations(selectedSnippet, activeLines),
    [selectedSnippet, activeLines]
  );

  useEffect(() => {
    if (!parentRef.current || !selectedSnippet) return undefined;

    const mode = languageModeFor(selectedSnippet.language);
    const startState = EditorState.create({
      doc: selectedSnippet.code,
      extensions: [
        lineNumbers(),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        languageCompartment.current.of(mode ? [mode] : []),
        highlightCompartment.current.of(highlightLinesExtension(activeLines)),
        editorTheme
      ]
    });

    const view = new EditorView({
      state: startState,
      parent: parentRef.current
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [selectedSnippet?.id]);

  useEffect(() => {
    if (!viewRef.current || !selectedSnippet) return;
    const mode = languageModeFor(selectedSnippet.language);
    viewRef.current.dispatch({
      effects: languageCompartment.current.reconfigure(mode ? [mode] : [])
    });
  }, [selectedSnippet?.language]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: highlightCompartment.current.reconfigure(highlightLinesExtension(activeLines))
    });
  }, [activeLines]);

  if (!selectedSnippet) return null;

  function handleTabKey(e, index) {
    if (!Array.isArray(snippets) || snippets.length < 2) return;
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % snippets.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + snippets.length) % snippets.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = snippets.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setSelectedId(snippets[nextIndex].id);
    const nextTab = tabRefs.current[nextIndex];
    if (nextTab) nextTab.focus();
  }

  const showTabs = Array.isArray(snippets) && snippets.length > 1;

  return (
    <section
      className="scene-code-snippet"
      aria-label="Code snippets"
      data-snippet-id={selectedSnippet.id}
      data-language={selectedSnippet.language}
      data-active-lines={activeLines.join(",")}
    >
      {showTabs && (
        <div className="snippet-tabs" role="tablist" aria-label="Code snippets">
          {snippets.map((s, index) => {
            const selected = s.id === selectedId;
            return (
              <button
                key={s.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                type="button"
                role="tab"
                id={`snippet-tab-${s.id}`}
                aria-label={s.id}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                className="snippet-tab"
                onClick={() => setSelectedId(s.id)}
                onKeyDown={(e) => handleTabKey(e, index)}
              >
                {s.file || s.id}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="snippet-editor"
        ref={parentRef}
        id={panelId}
        role="tabpanel"
        aria-labelledby={`snippet-tab-${selectedSnippet.id}`}
      />

      <pre className="sr-only" aria-hidden="false">
        {selectedSnippet.code}
      </pre>

      {error && <p className="snippet-error">{error}</p>}

      {annotations.length > 0 && (
        <ul className="snippet-annotations" aria-label="Snippet annotations">
          {annotations.map((annotation, index) => (
            <li
              key={index}
              className={`snippet-annotation ${
                activeLines.includes(annotation.line) ? "snippet-annotation-active" : ""
              }`}
            >
              <span className="snippet-annotation-line">L{annotation.line}</span>
              <span className="snippet-annotation-text">{annotation.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
