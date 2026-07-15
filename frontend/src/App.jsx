import { useCallback, useEffect, useState } from "react";
import AppHeader from "./components/AppHeader.jsx";
import ProfileBuilder from "./components/ProfileBuilder.jsx";
import GameField from "./components/GameField.jsx";
import ArtifactContainer from "./components/ArtifactContainer.jsx";
import StatusPanel from "./components/StatusPanel.jsx";
import {
  getOptions,
  listProfiles,
  createProfile,
  listTopics,
  getCachedArtifact,
  generateArtifact,
  getSession,
  updateSession
} from "./lib/api.js";
import {
  selectActiveProfile,
  selectActiveTopic,
  computeActiveSurface,
  artifactStatusLabel
} from "./lib/productState.js";

const BOOT_ERROR = "Unable to load the product. Please check your connection and try again.";

export default function App() {
  const [options, setOptions] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [topics, setTopics] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);
  const [artifactResponse, setArtifactResponse] = useState(null);
  const [status, setStatus] = useState("loading");
  const [statusMessage, setStatusMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [checkingCache, setCheckingCache] = useState(false);
  const [session, setSession] = useState(null);

  const boot = useCallback(async () => {
    setStatus("loading");
    setStatusMessage("");

    const results = await Promise.allSettled([
      getOptions(),
      listProfiles(),
      listTopics()
    ]);

    const [optionsResult, profilesResult, topicsResult] = results;

    if (optionsResult.status === "rejected") {
      setStatus("error");
      setStatusMessage(optionsResult.reason.message || BOOT_ERROR);
      return;
    }
    if (profilesResult.status === "rejected") {
      setStatus("error");
      setStatusMessage(profilesResult.reason.message || BOOT_ERROR);
      return;
    }
    if (topicsResult.status === "rejected") {
      setStatus("error");
      setStatusMessage(topicsResult.reason.message || BOOT_ERROR);
      return;
    }

    const loadedOptions = optionsResult.value;
    const loadedProfiles = Array.isArray(profilesResult.value) ? profilesResult.value : [];
    const loadedTopics = Array.isArray(topicsResult.value) ? topicsResult.value : [];

    setOptions(loadedOptions);
    setProfiles(loadedProfiles);
    setTopics(loadedTopics);

    const profile = selectActiveProfile(loadedProfiles, null);
    const topic = selectActiveTopic(loadedTopics, null, profile);

    setActiveProfile(profile);
    setActiveTopic(topic);
    setArtifactResponse(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      if (!activeProfile || !activeTopic) {
        if (!cancelled) setSession(null);
        return;
      }
      try {
        const loaded = await getSession(activeProfile.id, activeTopic.id);
        if (!cancelled) setSession(loaded);
      } catch (_) {
        if (!cancelled) setSession(null);
      }
    }
    loadSession();
    return () => { cancelled = true; };
  }, [activeProfile, activeTopic]);

  const handleProfileSave = useCallback(async (payload) => {
    setStatusMessage("");
    try {
      const created = await createProfile(payload);
      const updatedProfiles = [...profiles, created];
      setProfiles(updatedProfiles);
      setActiveProfile(created);
      const topic = selectActiveTopic(topics, null, created);
      setActiveTopic(topic);
      setArtifactResponse(null);
      setStatusMessage("Profile saved.");
    } catch (e) {
      setStatusMessage(e.message);
    }
  }, [profiles, topics]);

  const handleProfileSelect = useCallback((profileId) => {
    const profile = selectActiveProfile(profiles, profileId);
    setActiveProfile(profile);
    const topic = selectActiveTopic(topics, null, profile);
    setActiveTopic(topic);
    setArtifactResponse(null);
  }, [profiles, topics]);

  const handleTopicSelect = useCallback((topicId) => {
    setActiveTopic(selectActiveTopic(topics, topicId, activeProfile));
    setArtifactResponse(null);
  }, [topics, activeProfile]);

  const handleCheckCache = useCallback(async () => {
    if (!activeProfile || !activeTopic || checkingCache || generating) return;
    setCheckingCache(true);
    setStatusMessage("");
    try {
      const result = await getCachedArtifact(activeProfile.id, activeTopic.id);
      setArtifactResponse(result);
      if (artifactStatusLabel(result) === "cached") {
        setStatusMessage("Found existing artifact.");
      } else {
        setStatusMessage("No cached artifact yet. You can generate one.");
      }
    } catch (e) {
      setStatusMessage(e.message);
    } finally {
      setCheckingCache(false);
    }
  }, [activeProfile, activeTopic, checkingCache, generating]);

  const handleGenerate = useCallback(async () => {
    if (!activeProfile || !activeTopic || generating || checkingCache) return;
    setGenerating(true);
    setStatusMessage("");
    try {
      const result = await generateArtifact(activeProfile.id, activeTopic.id);
      setArtifactResponse(result);
      setStatusMessage("Artifact generated.");
    } catch (e) {
      setStatusMessage(e.message);
    } finally {
      setGenerating(false);
    }
  }, [activeProfile, activeTopic, generating, checkingCache]);

  const handleUpdateSession = useCallback(async (patch) => {
    if (!activeProfile || !activeTopic) return { ok: false, error: "No active profile or topic" };
    try {
      const updated = await updateSession(activeProfile.id, activeTopic.id, patch);
      setSession(updated);
      return { ok: true, session: updated };
    } catch (e) {
      setStatusMessage(e.message);
      return { ok: false, error: e.message };
    }
  }, [activeProfile, activeTopic]);

  const surface = computeActiveSurface(activeProfile, activeTopic, artifactStatusLabel(artifactResponse));
  const artifactPayload = artifactResponse?.artifact ?? null;

  if (status === "loading") {
    return (
      <div className="app-shell">
        <AppHeader activeProfile={activeProfile} profiles={profiles} onProfileSelect={handleProfileSelect} />
        <main className="center-state" aria-live="polite">
          <div className="state-card">
            <p className="eyebrow">Starting up</p>
            <h2>Loading Refract...</h2>
            <p>Getting your workspace ready.</p>
          </div>
        </main>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="app-shell">
        <AppHeader activeProfile={activeProfile} profiles={profiles} onProfileSelect={handleProfileSelect} />
        <main className="center-state" aria-live="polite">
          <div className="state-card unavailable-card">
            <p className="eyebrow">Setup unavailable</p>
            <h2>Refract cannot start right now.</h2>
            <p>Please check your network and try again in a moment.</p>
            <p className="state-detail">{statusMessage}</p>
            <p className="friendly-command">Developer note: make sure the backend service is running, then retry.</p>
            <button type="button" onClick={boot}>Try again</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader
        activeProfile={activeProfile}
        profiles={profiles}
        onProfileSelect={handleProfileSelect}
        activeTopic={activeTopic}
      />
      <StatusPanel message={statusMessage} />

      {surface === "profile-builder" ? (
        <ProfileBuilder
          options={options}
          onSave={handleProfileSave}
          saveDisabled={false}
        />
      ) : null}

      {surface === "game-field" ? (
        <GameField
          topics={topics}
          activeProfile={activeProfile}
          activeTopic={activeTopic}
          artifactResult={artifactResponse}
          onTopicSelect={handleTopicSelect}
          onCheckCache={handleCheckCache}
          onGenerate={handleGenerate}
          generating={generating}
          checkingCache={checkingCache}
          onNewProfile={() => {
            setActiveProfile(null);
            setActiveTopic(null);
            setArtifactResponse(null);
          }}
        />
      ) : null}

      {surface === "artifact-canvas" && artifactPayload ? (
        <ArtifactContainer
          artifact={artifactPayload}
          session={session}
          activeProfile={activeProfile}
          activeTopic={activeTopic}
          onUpdateSession={handleUpdateSession}
        />
      ) : null}
    </div>
  );
}