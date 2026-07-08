import QueuePreview from "../QueuePreview.jsx";

function LensCard({ label, lens }) {
  return (
    <article className="lens-card">
      <p className="eyebrow">{label}</p>
      <h4>{lens?.title}</h4>
      <p>{lens?.angle}</p>
      <small>{lens?.studentTakeaway}</small>
    </article>
  );
}

function VisualPlaceholder({ visual, title }) {
  return (
    <section className="visual-card">
      <p className="eyebrow">{title}</p>
      <h3>{visual?.title}</h3>
      <QueuePreview
        items={visual?.items || []}
        frontLabel={visual?.frontLabel || "front"}
        backLabel={visual?.backLabel || "back"}
      />
    </section>
  );
}

export default function StoryTab({ artifact, setActiveTab }) {
  return (
    <div className="story-grid">
      <section className="story-copy">
        <p className="eyebrow">Story</p>
        <h3>{artifact.story?.context}</h3>
        <p>{artifact.story?.goal}</p>
        <div className="lens-grid">
          <LensCard label="DSA" lens={artifact.lenses?.dsa} />
          <LensCard label="System Design" lens={artifact.lenses?.system_design} />
          <LensCard label="Game Theory" lens={artifact.lenses?.game_theory} />
        </div>
        <button type="button" className="primary-action" onClick={() => setActiveTab("explore")}>Try the simulation</button>
      </section>
      <VisualPlaceholder visual={artifact.canvas?.storyVisual} title="Concept visual" />
    </div>
  );
}
