import { useState } from "react";
import { runCode } from "../../lib/api.js";

const SUPPORTED_LANGUAGES = new Set(["python"]);

export default function PracticePanel({
  artifact,
  session,
  activeProfile,
  onUpdateSession
}) {
  const artifactLanguage = artifact?.practice?.language ?? activeProfile?.language ?? "python";
  const allowedDsaTopics = new Set(["dsa.queue"]);

  const [code, setCode] = useState(() => {
    if (session?.code && typeof session.code === "string") return session.code;
    if (artifact?.practice?.starterCode && typeof artifact.practice.starterCode === "string") {
      return artifact.practice.starterCode;
    }
    return "";
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(session?.latestRunResult ?? null);
  const [error, setError] = useState(null);

  const canRun = SUPPORTED_LANGUAGES.has(artifactLanguage) && allowedDsaTopics.has(artifact?.topicId);

  function handleCodeChange(e) {
    const next = e.target.value;
    setCode(next);
    if (typeof onUpdateSession === "function") {
      onUpdateSession({ code: next });
    }
  }

  async function handleRun() {
    if (!canRun || running) return;
    setRunning(true);
    setError(null);
    try {
      const runResult = await runCode(
        artifact?.profileId ?? null,
        artifact?.topicId ?? null,
        artifactLanguage,
        code
      );
      setResult(runResult);
      if (typeof onUpdateSession === "function") {
        onUpdateSession({
          latestRunResult: runResult,
          traceEvents: Array.isArray(runResult.traceEvents) ? runResult.traceEvents : [],
          recentEvents: [{ type: "practice.run", ts: Date.now(), payload: { success: runResult.success } }]
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const supportedLabel = canRun
    ? null
    : `${artifactLanguage} practice runner is not available yet. Phase 1 supports Python for dsa.queue.`;

  return (
    <section className="practice-panel" aria-label="Practice panel">
      <div className="practice-header">
        <p className="eyebrow">Practice</p>
        <h3>Write and run code</h3>
        {artifact?.practice?.prompt ? (
          <p className="practice-prompt">{artifact.practice.prompt}</p>
        ) : null}
      </div>

      <div className="practice-editor-area">
        <textarea
          className="practice-editor"
          value={code}
          onChange={handleCodeChange}
          spellCheck={false}
          rows={14}
          aria-label="Code editor"
          placeholder="# Write your code here..."
        />
        <div className="practice-actions">
          <button
            type="button"
            className="primary-action run-btn"
            onClick={handleRun}
            disabled={!canRun || running}
            aria-busy={running ? "true" : undefined}
            aria-label={`Run ${artifactLanguage} code`}
          >
            {running ? "Running..." : `Run (${artifactLanguage})`}
          </button>
          {!canRun ? (
            <p className="practice-support-note" role="note">
              {supportedLabel}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="practice-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="practice-result" aria-label="Run result">
          <div className="result-header">
            <span className={`result-badge ${result.success ? "result-pass" : "result-fail"}`}>
              {result.success ? "Passed" : "Failed"}
            </span>
            {result.summary ? <span className="result-summary">{result.summary}</span> : null}
          </div>

          {result.stdout ? (
            <div className="result-output">
              <p className="eyebrow">Output</p>
              <pre className="result-stdout">{result.stdout}</pre>
            </div>
          ) : null}

          {result.stderr ? (
            <div className="result-output result-stderr">
              <p className="eyebrow">Errors</p>
              <pre className="result-stderr-text">{result.stderr}</pre>
            </div>
          ) : null}

          {Array.isArray(result.traceEvents) && result.traceEvents.length > 0 ? null : (
            result.success ? (
              <p className="practice-note">Run completed. No trace events produced — trace replay may use past events.</p>
            ) : null
          )}
        </div>
      ) : null}

      {session?.code && !result ? (
        <p className="practice-note">Code saved to session. Press Run to execute and get results.</p>
      ) : null}
    </section>
  );
}