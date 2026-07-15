import { getVisualComponent, isRecognizedKind } from "../visuals/visualRegistry.js";
import VisualStage from "./VisualStage.jsx";
import ArtifactChat from "./ArtifactChat.jsx";
import PracticePanel from "./PracticePanel.jsx";
import TraceControls from "../visuals/TraceControls.jsx";
import { formatDecision } from "../../lib/productState.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export default function ArtifactWorkspace({
  artifact,
  session,
  activeProfile,
  activeTopic,
  onUpdateSession
}) {
  const visualKind = artifact?.visual?.kind ?? null;
  const VisualComponent = getVisualComponent(visualKind);
  const traceMode = session?.canvasState?.mode === "replay" ? "replay" : "live";

  const story = artifact?.story;
  const connections = artifact?.connections;
  const examples = artifact?.examples;
  const next = artifact?.next;

  return (
    <div className="artifact-workspace" aria-label="Artifact workspace">
      <section className="workspace-hero">
        <p className="eyebrow">{artifact?.title ?? "Artifact"}</p>
        <h2>{artifact?.title}</h2>
        <p className="workspace-summary">{artifact?.summary}</p>
      </section>

      {story ? (
        <section className="workspace-story" aria-label="Story">
          <h3 className="workspace-section-title">Story</h3>
          {story.premise ? (
            <div className="story-block">
              <p className="eyebrow">Premise</p>
              <p className="story-text">{story.premise}</p>
            </div>
          ) : null}
          {story.objective ? (
            <div className="story-block">
              <p className="eyebrow">Objective</p>
              <p className="story-text">{story.objective}</p>
            </div>
          ) : null}
          {Array.isArray(story.decisions) && story.decisions.length > 0 ? (
            <div className="story-block">
              <p className="eyebrow">Decisions</p>
              <ul className="decisions-list">
                {story.decisions.map((d, idx) => (
                  <li key={`dec-${idx}`} className="decision-item">{formatDecision(d)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {story.audioScript ? (
            <div className="story-block">
              <p className="eyebrow">Audio script</p>
              <p className="story-text">{story.audioScript}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {connections ? (
        <section className="workspace-connections" aria-label="Connections">
          <h3 className="workspace-section-title">Connections</h3>
          {Array.isArray(connections.core) && connections.core.length > 0 ? (
            <div className="conn-group">
              <p className="eyebrow">Core domains</p>
              <ul className="conn-list">
                {connections.core.map((id) => (
                  <li key={`core-${id}`} className="conn-chip">{id}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {Array.isArray(connections.paired) && connections.paired.length > 0 ? (
            <div className="conn-group">
              <p className="eyebrow">Paired domains</p>
              <ul className="conn-list">
                {connections.paired.map((id) => (
                  <li key={`paired-${id}`} className="conn-chip">{id}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {Array.isArray(examples) && examples.length > 0 ? (
        <section className="workspace-examples" aria-label="Examples">
          <h3 className="workspace-section-title">Examples</h3>
          <div className="examples-list">
            {examples.map((ex, idx) => (
              <div key={`ex-${idx}`} className="example-card">
                {typeof ex === "object" && ex !== null ? (
                  <>
                    {ex.title ? <h4>{ex.title}</h4> : null}
                    {ex.content ? <p>{ex.content}</p> : null}
                    {ex.code ? <pre>{ex.code}</pre> : null}
                  </>
                ) : (
                  <p>{String(ex)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="workspace-visual" aria-label="Visualization">
        <h3 className="workspace-section-title">Visual</h3>
        {isPlainObject(artifact?.experience) ? (
          <VisualStage
            experience={artifact.experience}
            session={session}
            onUpdateSession={onUpdateSession}
          />
        ) : VisualComponent ? (
          <VisualComponent
            visual={artifact.visual}
            session={session}
            onUpdateSession={onUpdateSession}
            traceMode={traceMode}
            artifactLanguage={activeProfile?.language ?? artifact?.practice?.language}
          />
        ) : (
          <div className="visual-unsupported" role="status">
            <p className="eyebrow">Visualization</p>
            {visualKind ? (
              isRecognizedKind(visualKind) ? (
                <p>The &quot;{visualKind}&quot; visual will appear when its implementation is complete. For now, use the trace controls and practice panel below.</p>
              ) : (
                <p>The requested visual type is not recognized.</p>
              )
            ) : (
              <p>No visual data available for this artifact.</p>
            )}
          </div>
        )}
      </section>

      <section className="workspace-practice" aria-label="Practice">
        <h3 className="workspace-section-title">Practice</h3>
        <PracticePanel
          artifact={artifact}
          session={session}
          activeProfile={activeProfile}
          onUpdateSession={onUpdateSession}
        />
      </section>

      <section className="workspace-trace" aria-label="Trace">
        <h3 className="workspace-section-title">Trace replay</h3>
        {Array.isArray(session?.traceEvents) && session.traceEvents.length > 0 ? (
          <TraceControls
            traceEvents={session.traceEvents}
            onUpdateSession={onUpdateSession}
          />
        ) : (
          <div className="trace-empty" role="status">
            <p>No trace events yet. Run your code in the Practice panel to generate trace events, then replay them here.</p>
          </div>
        )}
      </section>

      {Array.isArray(next) && next.length > 0 ? (
        <section className="workspace-next" aria-label="Next topics">
          <h3 className="workspace-section-title">Next</h3>
          <ul className="next-list">
            {next.map((tid) => (
              <li key={`next-${tid}`} className="next-chip">{tid}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ArtifactChat
        artifact={artifact}
        session={session}
        activeProfile={activeProfile}
        activeTopic={activeTopic}
        onUpdateSession={onUpdateSession}
      />
    </div>
  );
}
