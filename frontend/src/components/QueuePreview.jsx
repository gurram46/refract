import { useMemo } from "react";

export default function QueuePreview({ items, frontLabel, backLabel }) {
  const displayItems = useMemo(() => (items.length ? items : ["empty"]), [items]);

  return (
    <div className="queue-preview" aria-label="Queue visual placeholder">
      <div className="queue-row">
        {displayItems.map((item, index) => (
          <div key={`${item}-${index}`} className={`queue-item ${item === "empty" ? "empty" : ""}`}>{item}</div>
        ))}
      </div>
      <div className="queue-labels">
        <span>{frontLabel}</span>
        <span>{backLabel}</span>
      </div>
    </div>
  );
}
