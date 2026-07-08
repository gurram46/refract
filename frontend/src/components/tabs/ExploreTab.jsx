import QueuePreview from "../QueuePreview.jsx";

export default function ExploreTab({ artifact, setActiveTab }) {
  const spec = artifact.canvas?.exploreSpec;

  return (
    <div className="explore-grid">
      <section>
        <p className="eyebrow">Explore</p>
        <h3>Move the queue by hand.</h3>
        <p>These controls come from the artifact JSON. Real simulation behavior arrives in the canvas phase.</p>
        <div className="placeholder-controls" aria-label="Simulation controls placeholder">
          {spec?.controls?.map((control) => (
            <button key={`${control.type}-${control.param || control.label}`} type="button" disabled>
              {control.label}
            </button>
          ))}
        </div>
        <button type="button" className="primary-action" onClick={() => setActiveTab("practice")}>Start coding</button>
      </section>
      <QueuePreview items={spec?.initialItems || []} frontLabel="front" backLabel="back" />
    </div>
  );
}
