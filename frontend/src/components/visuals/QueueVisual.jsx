import { useState } from "react";

export default function QueueVisual({ visual, session, onUpdateSession, traceMode }) {
  const isReplay = traceMode === "replay";

  const [liveItems, setLiveItems] = useState(() => {
    if (session?.canvasState?.liveItems && Array.isArray(session.canvasState.liveItems)) {
      return [...session.canvasState.liveItems];
    }
    if (visual?.initialState && Array.isArray(visual.initialState.items)) {
      return [...visual.initialState.items];
    }
    return [];
  });

  const liveFront = liveItems.length > 0 ? 0 : null;
  const liveBack = liveItems.length > 0 ? liveItems.length - 1 : null;
  const liveCurrent = !isReplay ? (session?.canvasState?.liveIndex ?? null) : null;

  function persistLive(nextItems, nextIndex) {
    setLiveItems(nextItems);
    if (typeof onUpdateSession === "function") {
      onUpdateSession({
        canvasState: {
          liveItems: nextItems,
          liveIndex: nextIndex,
          mode: "live"
        },
        recentEvents: [{
          type: nextItems.length > liveItems.length ? "queue.enqueue" : "queue.dequeue",
          ts: Date.now(),
          payload: { liveItems: nextItems, liveIndex: nextIndex }
        }]
      });
    }
  }

  function handleEnqueue() {
    const val = liveItems.length > 0
      ? Math.max(...liveItems.map(Number)) + 1
      : 1;
    const next = [...liveItems, val];
    persistLive(next, next.length - 1);
  }

  function handleDequeue() {
    if (liveItems.length === 0) return;
    const next = liveItems.slice(1);
    persistLive(next, next.length > 0 ? 0 : null);
  }

  function handleReset() {
    persistLive([], null);
  }

  const empty = liveItems.length === 0;

  return (
    <div className="queue-visual" aria-label="Queue visual">
      <div className="queue-mode-tag">
        <span className="mode-label">{isReplay ? "replay" : "live"}</span>
      </div>
      <div className="queue-state-row">
        {empty ? (
          <div className="queue-empty-state">Queue is empty</div>
        ) : (
          liveItems.map((item, idx) => (
            <div
              key={`q-${idx}`}
              className={`queue-node ${idx === liveFront ? "queue-front" : ""} ${idx === liveBack ? "queue-back" : ""} ${idx === liveCurrent ? "queue-current" : ""}`}
              aria-label={`${idx === liveFront ? "front " : ""}${idx === liveBack ? "back " : ""}${idx === liveCurrent ? "current " : ""}item ${item}`}
            >
              <span className="queue-node-value">{item}</span>
              {idx === liveFront ? <span className="queue-node-tag">front</span> : null}
              {idx === liveBack ? <span className="queue-node-tag">back</span> : null}
              {idx === liveCurrent && idx !== liveFront ? <span className="queue-node-tag">current</span> : null}
            </div>
          ))
        )}
      </div>
      <div className="queue-controls">
        <button type="button" className="queue-btn enqueue-btn" onClick={handleEnqueue} aria-label="Enqueue item">Enqueue</button>
        <button type="button" className="queue-btn dequeue-btn" onClick={handleDequeue} disabled={empty} aria-label="Dequeue item">Dequeue</button>
        <button type="button" className="queue-btn reset-btn" onClick={handleReset} disabled={empty} aria-label="Reset queue">Reset</button>
      </div>
      {liveFront !== null ? (
        <div className="queue-indices" aria-label="Queue pointers">
          <span>Front: {liveItems[liveFront]}</span>
          <span>Back: {liveItems[liveBack]}</span>
          {liveCurrent !== null ? <span>Current: {liveItems[liveCurrent]}</span> : null}
        </div>
      ) : null}
    </div>
  );
}