import ArtifactWorkspace from "./artifact/ArtifactWorkspace.jsx";

export default function ArtifactContainer({
  artifact,
  session,
  activeProfile,
  activeTopic,
  onUpdateSession
}) {
  return (
    <main className="workbench-shell" aria-label="Artifact canvas">
      <ArtifactWorkspace
        artifact={artifact}
        session={session}
        activeProfile={activeProfile}
        activeTopic={activeTopic}
        onUpdateSession={onUpdateSession}
      />
    </main>
  );
}