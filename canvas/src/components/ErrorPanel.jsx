export default function ErrorPanel({ error, code }) {
  if (!error) return null;

  return (
    <div className="error-panel">
      <div className="error-header">
        <div>
          <p className="eyebrow">Error</p>
          <h2>{error.message || "Canvas block failed"}</h2>
        </div>
        <button type="button" onClick={() => navigator.clipboard.writeText(code || "")}>
          Copy code
        </button>
      </div>
      {error.stack ? <pre>{error.stack}</pre> : null}
      <details>
        <summary>Failed code</summary>
        <pre>{code}</pre>
      </details>
    </div>
  );
}
