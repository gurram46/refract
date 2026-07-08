import { useEffect, useState } from "react";
import AppHeader from "./components/AppHeader.jsx";
import ArtifactContainer from "./components/ArtifactContainer.jsx";
import { fetchQueueArtifact } from "./lib/api.js";

export default function App() {
  const [artifact, setArtifact] = useState(null);
  const [activeTab, setActiveTab] = useState("story");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    loadArtifact();
  }, []);

  async function loadArtifact() {
    setStatus("loading");
    setError("");

    try {
      const data = await fetchQueueArtifact();
      setArtifact(data);
      setActiveTab("story");
      setStatus("ready");
    } catch (loadError) {
      setArtifact(null);
      setStatus("unavailable");
      setError(loadError.message || "Backend unavailable.");
    }
  }

  return (
    <div className="app-shell">
      <AppHeader />

      {status === "loading" ? <LoadingState /> : null}
      {status === "unavailable" ? <UnavailableState message={error} onRetry={loadArtifact} /> : null}
      {status === "ready" && artifact ? (
        <ArtifactContainer artifact={artifact} activeTab={activeTab} setActiveTab={setActiveTab} />
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <main className="center-state" aria-live="polite">
      <div className="state-card">
        <p className="eyebrow">Opening artifact</p>
        <h2>Loading Queue...</h2>
        <p>Getting the learning artifact ready.</p>
      </div>
    </main>
  );
}

function UnavailableState({ message, onRetry }) {
  return (
    <main className="center-state" aria-live="polite">
      <div className="state-card unavailable-card">
        <p className="eyebrow">Artifact unavailable</p>
        <h2>Queue cannot open yet.</h2>
        <p>Refract is having trouble opening this artifact. Try again in a moment.</p>
        <p className="state-detail">{message}</p>
        <p className="friendly-command">Developer note: start the backend service, then retry.</p>
        <button type="button" onClick={onRetry}>Try again</button>
      </div>
    </main>
  );
}
