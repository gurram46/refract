export default function ExperimentTray({ experiments, experimentState, onChange }) {
  if (!Array.isArray(experiments) || experiments.length === 0) return null;

  function handleChange(id, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (typeof onChange === "function") onChange(id, numeric);
  }

  return (
    <section className="experiment-tray" aria-label="Experiments">
      <h3 className="experiment-tray-title">Experiments</h3>
      <div className="experiment-controls">
        {experiments.map((experiment) => {
          const id = experiment?.id;
          const { kind, min, max, step, default: defaultValue } = experiment ?? {};
          if (
            typeof id !== "string" || !CAPABILITIES.experimentIds.includes(id) || kind !== "bounded-number" ||
            !Number.isFinite(min) || !Number.isFinite(max) || min > max ||
            !Number.isFinite(step) || step <= 0 || !Number.isFinite(defaultValue) ||
            defaultValue < min || defaultValue > max ||
            Math.abs((max - min) / step - Math.round((max - min) / step)) >= 1e-9 ||
            Math.abs((defaultValue - min) / step - Math.round((defaultValue - min) / step)) >= 1e-9
          ) return null;
          const persisted = experimentState?.[id];
          const clamped = Number.isFinite(persisted) && persisted >= min && persisted <= max &&
            Math.abs((persisted - min) / step - Math.round((persisted - min) / step)) < 1e-9
            ? persisted
            : defaultValue;
          return (
            <div key={id} className="experiment-control">
              <label className="experiment-label" htmlFor={`experiment-${id}`}>
                {id}
              </label>
              <input
                id={`experiment-${id}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={clamped}
                onChange={(e) => handleChange(id, e.target.value)}
                aria-label={`${id} value ${clamped}`}
              />
              <span className="experiment-value" aria-hidden="true">{clamped}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
import { CAPABILITIES } from "../../lib/artifactCapabilities.js";
