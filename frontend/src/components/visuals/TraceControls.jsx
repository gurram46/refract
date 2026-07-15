import { useState, useRef, useEffect } from "react";

export default function TraceControls({ traceEvents, onUpdateSession }) {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);

  const timerRef = useRef(null);
  const animFrameRef = useRef(null);

  const maxStep = Array.isArray(traceEvents) && traceEvents.length > 0 ? traceEvents.length - 1 : -1;
  const hasEvents = maxStep >= 0;

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearAnim() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearTimer();
      clearAnim();
    };
  }, []);

  function persistReplayStep(newStep, replayItemsOverride) {
    setStep(newStep);
    if (typeof onUpdateSession !== "function") return;

    if (newStep < 0 || newStep > maxStep || !hasEvents) {
      onUpdateSession({
        canvasState: { replayItems: [], replayStep: -1, mode: "replay" },
        currentStep: String(-1),
        recentEvents: [{ type: "trace.reset", ts: Date.now(), payload: { step: -1 } }]
      });
      return;
    }

    const event = traceEvents[newStep];
    const qState = replayItemsOverride ?? resolveQueueState([], traceEvents.slice(0, newStep + 1));

    onUpdateSession({
      canvasState: { replayItems: qState, replayStep: newStep, mode: "replay" },
      currentStep: String(newStep),
      recentEvents: [{ type: "trace.step", ts: Date.now(), payload: { step: newStep, eventType: event?.type ?? null } }]
    });
  }

  function handlePlay() {
    if (!hasEvents) return;
    setPlaying(true);
    clearTimer();
    const startStep = step < 0 ? 0 : step + 1;

    const id = setInterval(() => {
      setStep((prev) => {
        if (prev >= maxStep) {
          clearTimer();
          setPlaying(false);
          return prev;
        }
        const next = prev + 1;
        persistReplayStep(next);
        return next;
      });
    }, 500);
    timerRef.current = id;

    if (startStep <= maxStep && startStep !== step) {
      setStep(startStep);
      persistReplayStep(startStep);
    }
  }

  function handlePause() {
    setPlaying(false);
    clearTimer();
  }

  function handleStep() {
    if (playing || !hasEvents) return;
    const next = Math.min(step + 1, maxStep);
    persistReplayStep(next);
  }

  function handleReplay() {
    if (!hasEvents || playing) return;
    setPlaying(false);
    clearTimer();
    clearAnim();
    persistReplayStep(-1);
    setStep(-1);
    requestAnimationFrame(() => {
      handlePlay();
    });
  }

  function handleReset() {
    if (!hasEvents) return;
    setPlaying(false);
    clearTimer();
    clearAnim();
    persistReplayStep(-1);
    setStep(-1);
  }

  const stepLabel = step >= 0 ? `Step ${step + 1} / ${maxStep + 1}` : "No steps";

  return (
    <div className="trace-controls" aria-label="Trace replay controls">
      <div className="trace-status">
        <span className="trace-step-label">{stepLabel}</span>
        {hasEvents && step >= 0 ? (
          <span className="trace-event-type">Event: {traceEvents[step]?.type ?? "unknown"}</span>
        ) : null}
      </div>
      <div className="trace-buttons">
        <button type="button" className="trace-btn play-btn" onClick={handlePlay} disabled={!hasEvents || playing} aria-label="Play trace">Play</button>
        <button type="button" className="trace-btn pause-btn" onClick={handlePause} disabled={!playing} aria-label="Pause trace">Pause</button>
        <button type="button" className="trace-btn step-btn" onClick={handleStep} disabled={!hasEvents || playing || step >= maxStep} aria-label="Step forward">Step</button>
        <button type="button" className="trace-btn replay-btn" onClick={handleReplay} disabled={!hasEvents || playing} aria-label="Replay from start">Replay</button>
        <button type="button" className="trace-btn reset-btn" onClick={handleReset} disabled={!hasEvents} aria-label="Reset trace">Reset</button>
      </div>
    </div>
  );
}

function resolveQueueState(initial, events) {
  const items = [...initial];
  for (const event of events) {
    if (!event) continue;
    if (event.type === "queue.enqueue") {
      if (event.payload != null && typeof event.payload.item !== "undefined") {
        items.push(event.payload.item);
      } else {
        const nextVal = items.length > 0 ? Math.max(...items.map(Number)) + 1 : 1;
        items.push(nextVal);
      }
    } else if (event.type === "queue.dequeue") {
      if (items.length > 0) items.shift();
    }
  }
  return items;
}