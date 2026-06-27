import { useEffect, useRef, useState } from "react";
import { executeInSandbox } from "../lib/sandbox.js";
import AnimationControls from "./AnimationControls.jsx";
import ErrorPanel from "./ErrorPanel.jsx";

export default function CanvasPanel({ blocks, parseErrors }) {
  const outputRef = useRef(null);
  const controllerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [runtimeError, setRuntimeError] = useState(null);
  const [status, setStatus] = useState("empty");
  const [stepState, setStepState] = useState({ index: 0, total: 0 });

  const activeBlock = blocks[activeIndex] || null;

  useEffect(() => {
    setActiveIndex(0);
  }, [blocks]);

  useEffect(() => {
    if (!activeBlock || !outputRef.current) {
      setStatus("empty");
      return undefined;
    }

    setRuntimeError(null);
    setStatus("loading");
    setStepState({ index: 0, total: 0 });

    if (controllerRef.current) {
      controllerRef.current.destroy();
      controllerRef.current = null;
    }

    try {
      controllerRef.current = executeInSandbox({
        code: activeBlock.code,
        containerEl: outputRef.current,
        blockIndex: activeIndex,
        onMessage: (message) => {
          if (message.type === "ready") setStatus("ready");
          if (message.type === "error") {
            setStatus("error");
            setRuntimeError({ message: message.message, stack: message.stack });
          }
          if (message.type === "stepComplete") {
            setStepState({ index: message.index, total: message.total });
          }
        }
      });
    } catch (error) {
      setStatus("error");
      setRuntimeError(error);
    }

    return () => {
      if (controllerRef.current) {
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
    };
  }, [activeBlock, activeIndex]);

  return (
    <section className="panel canvas-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Output</p>
          <h2>Canvas preview</h2>
        </div>
        <span className={`status status-${status}`}>{status}</span>
      </div>

      {parseErrors?.length ? (
        <div className="parse-errors">
          {parseErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      {blocks.length > 1 ? (
        <div className="block-tabs">
          {blocks.map((block, index) => (
            <button
              key={block.index}
              type="button"
              className={index === activeIndex ? "active" : ""}
              onClick={() => setActiveIndex(index)}
            >
              Block {index + 1}
            </button>
          ))}
        </div>
      ) : null}

      <div className="output-shell" ref={outputRef}>
        {!activeBlock ? <p className="empty-state">Paste model output and render a canvas block.</p> : null}
      </div>

      <div className="step-readout">
        Step {stepState.index} / {stepState.total}
      </div>

      <AnimationControls controllerRef={controllerRef} disabled={!activeBlock || status === "error"} />
      <ErrorPanel error={runtimeError} code={activeBlock?.code || ""} />
    </section>
  );
}
