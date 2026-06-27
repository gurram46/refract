import { lazy, Suspense, useState } from "react";
import { modelOutputExamples } from "../lib/examples.js";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

export default function InputPanel({ value, onChange, onRender }) {
  const [useEditor, setUseEditor] = useState(false);

  return (
    <section className="panel input-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Input</p>
          <h1>Refract Canvas</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => setUseEditor((next) => !next)}>
          {useEditor ? "Textarea" : "Code Editor"}
        </button>
      </div>

      <div className="example-row" aria-label="Example model outputs">
        {modelOutputExamples.map((example) => (
          <button key={example.title} type="button" onClick={() => onChange(example.text)}>
            {example.title}
          </button>
        ))}
      </div>

      <div className="editor-shell">
        {useEditor ? (
          <Suspense fallback={<textarea value={value} onChange={(event) => onChange(event.target.value)} />}>
            <MonacoEditor
              height="100%"
              defaultLanguage="markdown"
              theme="vs-dark"
              value={value}
              onChange={(next) => onChange(next || "")}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                fontSize: 13,
                scrollBeyondLastLine: false
              }}
            />
          </Suspense>
        ) : (
          <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck="false" />
        )}
      </div>

      <button className="render-button" type="button" onClick={onRender}>
        Render
      </button>
    </section>
  );
}
