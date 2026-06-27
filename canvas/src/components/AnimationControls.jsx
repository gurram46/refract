import { useState } from "react";

export default function AnimationControls({ controllerRef, disabled }) {
  const [speed, setSpeed] = useState(1);
  const inactive = disabled || !controllerRef.current;

  const run = (method, value) => {
    if (!controllerRef.current) return;
    controllerRef.current[method](value);
  };

  return (
    <div className="controls" aria-label="Animation controls">
      <button type="button" disabled={inactive} onClick={() => run("prevStep")}>
        Prev
      </button>
      <button type="button" disabled={inactive} onClick={() => run("play")}>
        Play
      </button>
      <button type="button" disabled={inactive} onClick={() => run("pause")}>
        Pause
      </button>
      <button type="button" disabled={inactive} onClick={() => run("nextStep")}>
        Next
      </button>
      <label>
        Speed
        <select
          value={speed}
          disabled={inactive}
          onChange={(event) => {
            const next = Number(event.target.value);
            setSpeed(next);
            run("setSpeed", next);
          }}
        >
          <option value={0.25}>0.25x</option>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </label>
      <button type="button" disabled={inactive} onClick={() => run("exportPNG")}>
        Export PNG
      </button>
    </div>
  );
}
