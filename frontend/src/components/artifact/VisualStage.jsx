import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { useReducedMotion } from "motion/react";
import { seek } from "../../lib/sceneTimeline.js";
import { describeState, applyExperiments, reduce, validatePrecondition } from "../visuals/workerQueueState.js";
import WorkerQueueVisual from "../visuals/WorkerQueueVisual.jsx";
import PlaybackControls from "./PlaybackControls.jsx";
import PredictionCheckpoint from "./PredictionCheckpoint.jsx";
import ExperimentTray from "./ExperimentTray.jsx";

const SceneCodeSnippet = lazy(() => import("./SceneCodeSnippet.jsx"));

const SPEED_BASE_MS = 1200;
export const SPEEDS = Object.freeze([0.5, 1, 2]);

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectFocus(steps, currentStep) {
  if (currentStep < 0 || currentStep >= steps.length) return [];
  return Array.isArray(steps[currentStep].focus) ? steps[currentStep].focus : [];
}

function deriveCaption(steps, currentStep) {
  if (currentStep < 0 || currentStep >= steps.length) return null;
  return steps[currentStep]?.caption ?? null;
}

function deriveNarration(steps, currentStep) {
  if (currentStep < 0 || currentStep >= steps.length) return null;
  return steps[currentStep]?.narration ?? null;
}

function deriveAnimationPreset(steps, currentStep) {
  if (currentStep < 0 || currentStep >= steps.length) return null;
  return steps[currentStep]?.animationPreset ?? null;
}

function buildEvents(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => step?.event);
}

function timelineDiagnostic(initialState, events, step) {
  if (!initialState || !Array.isArray(events) || step < 0) return null;
  const bounded = Math.min(step, events.length - 1);
  let state = initialState;
  for (let index = 0; index <= bounded; index += 1) {
    const result = validatePrecondition(state, events[index]);
    if (!result.valid) return `Step ${index + 1}: ${result.diagnostic}`;
    state = reduce(state, events[index]);
  }
  return null;
}

function flattenExperience(experience) {
  if (!isPlainObject(experience)) return { initialState: null, steps: [] };
  const chapters = Array.isArray(experience.chapters) ? experience.chapters : [];
  const steps = [];
  for (const chapter of chapters) {
    if (!Array.isArray(chapter?.scenes)) continue;
    for (const scene of chapter.scenes) {
      if (!Array.isArray(scene?.steps)) continue;
      for (const step of scene.steps) {
        steps.push(step);
      }
    }
  }
  return { initialState: experience.primitive?.initialState ?? null, steps };
}

function flattenScenes(chapters) {
  if (!Array.isArray(chapters)) return [];
  const scenes = [];
  for (const chapter of chapters) {
    if (!Array.isArray(chapter?.scenes)) continue;
    for (const scene of chapter.scenes) {
      scenes.push(scene);
    }
  }
  return scenes;
}

function deriveSceneFromProps(props) {
  if (isPlainObject(props.experience)) {
    const { initialState, steps } = flattenExperience(props.experience);
    return {
      initialState,
      steps,
      snippets: Array.isArray(props.experience.snippets) ? props.experience.snippets : [],
      experiments: Array.isArray(props.experience.experiments) ? props.experience.experiments : [],
      scenes: flattenScenes(props.experience.chapters)
    };
  }
  if (Array.isArray(props.steps) && props.initialState) {
    return {
      initialState: props.initialState,
      steps: props.steps,
      snippets: Array.isArray(props.snippets) ? props.snippets : [],
      experiments: Array.isArray(props.experiments) ? props.experiments : [],
      scenes: Array.isArray(props.scenes) ? props.scenes : []
    };
  }
  if (props.scene && props.scene.initialState && Array.isArray(props.scene.steps)) {
    return {
      initialState: props.scene.initialState,
      steps: props.scene.steps,
      snippets: Array.isArray(props.scene.snippets) ? props.scene.snippets : [],
      experiments: Array.isArray(props.scene.experiments) ? props.scene.experiments : [],
      scenes: Array.isArray(props.scene.scenes) ? props.scene.scenes : []
    };
  }
  const visual = props.visual;
  const init = visual?.initialState;
  if (init && init.producer && init.channel && Array.isArray(init.workers)) {
    return { initialState: init, steps: [], snippets: [], experiments: [], scenes: [] };
  }
  return { initialState: null, steps: [], snippets: [], experiments: [], scenes: [] };
}

function deriveSnippetsFromProps(props) {
  if (Array.isArray(props.snippets)) return props.snippets;
  if (Array.isArray(props.scene?.snippets)) return props.scene.snippets;
  return [];
}

function deriveCodeRef(steps, currentStep) {
  if (currentStep < 0 || currentStep >= steps.length) return null;
  const ref = steps[currentStep]?.snippet;
  if (!ref || typeof ref !== "object") return null;
  return { snippetId: ref.id, lines: ref.lines ?? ref.highlightLines };
}

function resolveStepSceneInfo(scenes, steps, currentStep) {
  if (currentStep < 0 || currentStep >= steps.length) return null;
  const activeStep = steps[currentStep];
  if (!activeStep?.id) return null;
  for (const scene of scenes) {
    if (!Array.isArray(scene?.steps)) continue;
    const localIndex = scene.steps.findIndex((s) => s?.id === activeStep.id);
    if (localIndex !== -1) {
      return { sceneId: scene.id, isLastStep: localIndex === scene.steps.length - 1 };
    }
  }
  return null;
}

export default function VisualStage(props) {
  const {
    initialState: initProp,
    steps: stepsProp,
    snippets: snippetsProp,
    experiments: experimentsProp,
    scenes: scenesProp
  } = deriveSceneFromProps(props);
  const {
    currentStep: controlledStep,
    onStepChange,
    playing: controlledPlaying,
    onPlayingChange,
    speed: controlledSpeed,
    onSpeedChange,
    reducedMotion: reducedMotionOverride,
    session,
    onUpdateSession
  } = props;

  const isControlledStep = typeof controlledStep === "number";
  const isControlledPlaying = typeof controlledPlaying === "boolean";
  const isControlledSpeed = SPEEDS.includes(controlledSpeed);

  const [internalStep, setInternalStep] = useState(-1);
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [internalSpeed, setInternalSpeed] = useState(1);

  const step = isControlledStep ? controlledStep : internalStep;
  const playing = isControlledPlaying ? controlledPlaying : internalPlaying;
  const speed = isControlledSpeed ? controlledSpeed : internalSpeed;

  const osReducedMotion = useReducedMotion();
  const reducedMotion = reducedMotionOverride ?? !!osReducedMotion;

  const stepList = Array.isArray(stepsProp) ? stepsProp : [];
  const lastIdx = stepList.length - 1;
  const events = useMemo(() => buildEvents(stepList), [stepList]);
  const snippets = useMemo(() => Array.isArray(snippetsProp) ? snippetsProp : deriveSnippetsFromProps(props), [snippetsProp, props.snippets, props.scene?.snippets]);
  const codeRef = useMemo(() => deriveCodeRef(stepList, step), [stepList, step]);

  const experiments = useMemo(() => Array.isArray(experimentsProp) ? experimentsProp : [], [experimentsProp]);
  const scenes = useMemo(() => Array.isArray(scenesProp) ? scenesProp : [], [scenesProp]);

  const experimentState = useMemo(() => {
    const fromProps = props.experimentState;
    if (isPlainObject(fromProps)) return fromProps;
    const fromSession = session?.progress?.experimentState;
    return isPlainObject(fromSession) ? fromSession : null;
  }, [props.experimentState, session?.progress?.experimentState]);

  const adjustedInitialState = useMemo(() => {
    if (!initProp) return null;
    return applyExperiments(initProp, experimentState, experiments);
  }, [initProp, experimentState, experiments]);

  const viewState = useMemo(() => {
    if (!adjustedInitialState) return null;
    return seek(adjustedInitialState, events, step);
  }, [adjustedInitialState, events, step]);
  const diagnostic = useMemo(
    () => timelineDiagnostic(adjustedInitialState, events, step),
    [adjustedInitialState, events, step]
  );

  const focus = useMemo(() => collectFocus(stepList, step), [stepList, step]);
  const caption = useMemo(() => deriveCaption(stepList, step), [stepList, step]);
  const narration = useMemo(() => deriveNarration(stepList, step), [stepList, step]);
  const preset = useMemo(() => deriveAnimationPreset(stepList, step), [stepList, step]);

  const announceRef = useRef(null);
  const lastAnnouncedStepRef = useRef(null);
  const lastAnnouncedStateRef = useRef("");

  const checkpoint = stepList[step]?.checkpoint;
  const stepId = stepList[step]?.id ?? null;
  const sceneInfo = useMemo(() => resolveStepSceneInfo(scenes, stepList, step), [scenes, stepList, step]);
  const sceneId = sceneInfo?.sceneId ?? null;
  const checkpointStepIds = useMemo(() => new Set(session?.progress?.checkpointStepIds ?? []), [session?.progress?.checkpointStepIds]);
  const answered = stepId ? checkpointStepIds.has(stepId) : false;

  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [checkpointStatus, setCheckpointStatus] = useState({ status: "idle", error: null });
  const [sceneSave, setSceneSave] = useState({ sceneId: null, status: "idle", error: null });
  const [experimentSave, setExperimentSave] = useState({ status: "idle", error: null });

  useEffect(() => {
    setSelectedOptionId(null);
    setCheckpointStatus({ status: answered ? "success" : "idle", error: null });
  }, [stepId, answered]);

  useEffect(() => {
    if (lastAnnouncedStepRef.current !== step && announceRef.current) {
      const captionText = caption ? ` ${caption}.` : "";
      announceRef.current.textContent = `Step ${step + 1} of ${Math.max(1, lastIdx + 1)}.${captionText}`;
      lastAnnouncedStepRef.current = step;
    }
  }, [step, caption, lastIdx]);

  useEffect(() => {
    if (!viewState) return;
    const summary = describeState(viewState);
    if (summary !== lastAnnouncedStateRef.current && announceRef.current) {
      announceRef.current.dataset.state = summary;
      lastAnnouncedStateRef.current = summary;
    }
  }, [viewState]);

  const recordedSceneRef = useRef(null);
  async function saveScene(info) {
    if (!info?.sceneId || !onUpdateSession) return;
    const currentProgress = session?.progress ?? {};
    const completedSceneIds = new Set(currentProgress.completedSceneIds ?? []);
    if (completedSceneIds.has(info.sceneId)) {
      recordedSceneRef.current = info.sceneId;
      return;
    }
    completedSceneIds.add(info.sceneId);
    setSceneSave({ sceneId: info.sceneId, status: "pending", error: null });
    try {
      const result = await onUpdateSession({
        progress: { ...currentProgress, completedSceneIds: [...completedSceneIds] }
      });
      if (result?.ok) {
        recordedSceneRef.current = info.sceneId;
        setSceneSave({ sceneId: info.sceneId, status: "success", error: null });
      } else {
        setSceneSave({ sceneId: info.sceneId, status: "error", error: result?.error || "Could not save scene progress." });
      }
    } catch (error) {
      setSceneSave({ sceneId: info.sceneId, status: "error", error: error.message || "Could not save scene progress." });
    }
  }

  useEffect(() => {
    if (!sceneInfo || !sceneInfo.isLastStep || !sceneInfo.sceneId || !onUpdateSession) return;
    if (recordedSceneRef.current === sceneInfo.sceneId) return;
    void saveScene(sceneInfo);
  }, [sceneInfo, session, onUpdateSession]);

  const timerRef = useRef(null);
  useEffect(() => {
    function clearTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    if (!playing) {
      clearTimer();
      return undefined;
    }
    if (lastIdx < 0) return undefined;
    if (step >= lastIdx) {
      if (!isControlledPlaying) setInternalPlaying(false);
      if (typeof onPlayingChange === "function") onPlayingChange(false);
      clearTimer();
      return undefined;
    }
    const delay = SPEED_BASE_MS / speed;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const next = step + 1;
      if (next > lastIdx) {
        if (!isControlledPlaying) setInternalPlaying(false);
        if (typeof onPlayingChange === "function") onPlayingChange(false);
        return;
      }
      if (!isControlledStep) setInternalStep(next);
      if (typeof onStepChange === "function") onStepChange(next);
    }, delay);
    return clearTimer;
  }, [playing, step, lastIdx, speed, isControlledStep, isControlledPlaying, onStepChange, onPlayingChange]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  function goTo(next) {
    const bounded = clamp(next, -1, lastIdx);
    if (!isControlledStep) setInternalStep(bounded);
    if (typeof onStepChange === "function") onStepChange(bounded);
  }

  function handlePrevious() { goTo(step - 1); }
  function handleNext() { goTo(step + 1); }

  function handlePlay() {
    if (lastIdx < 0) return;
    if (step < 0) goTo(0);
    else if (step >= lastIdx) goTo(0);
    if (!isControlledPlaying) setInternalPlaying(true);
    if (typeof onPlayingChange === "function") onPlayingChange(true);
  }

  function handlePause() {
    if (!isControlledPlaying) setInternalPlaying(false);
    if (typeof onPlayingChange === "function") onPlayingChange(false);
  }

  function handleReplay() {
    goTo(0);
    if (!isControlledPlaying) setInternalPlaying(true);
    if (typeof onPlayingChange === "function") onPlayingChange(true);
  }

  function handleSpeedChange(next) {
    if (!SPEEDS.includes(next)) return;
    if (!isControlledSpeed) setInternalSpeed(next);
    if (typeof onSpeedChange === "function") onSpeedChange(next);
  }

  async function handleExperimentChange(id, value) {
    if (typeof onUpdateSession !== "function") return;
    const currentProgress = session?.progress ?? {};
    const nextExperimentState = { ...(currentProgress.experimentState ?? {}), [id]: value };
    const progress = { ...currentProgress, experimentState: nextExperimentState };
    setExperimentSave({ status: "pending", error: null });
    try {
      const result = await onUpdateSession({ progress });
      if (result?.ok) setExperimentSave({ status: "success", error: null });
      else setExperimentSave({ status: "error", error: result?.error || "Could not save experiment." });
    } catch (error) {
      setExperimentSave({ status: "error", error: error.message || "Could not save experiment." });
    }
  }

  async function handleCheckpointSubmit() {
    if (!stepId || selectedOptionId == null || typeof onUpdateSession !== "function") return;
    setCheckpointStatus({ status: "pending", error: null });
    const currentProgress = session?.progress ?? {};
    const nextCheckpointStepIds = new Set(currentProgress.checkpointStepIds ?? []);
    nextCheckpointStepIds.add(stepId);
    const progress = { ...currentProgress, checkpointStepIds: [...nextCheckpointStepIds] };
    try {
      const result = await onUpdateSession({ progress });
      if (result?.ok) {
        setCheckpointStatus({ status: "success", error: null });
      } else {
        setCheckpointStatus({ status: "error", error: result?.error || "Could not save answer." });
      }
    } catch (e) {
      setCheckpointStatus({ status: "error", error: e.message || "Could not save answer." });
    }
  }

  if (!initProp) {
    return (
      <div className="visual-stage" role="status" aria-live="polite">
        <p className="eyebrow">Visual</p>
        <p>No initial state provided.</p>
      </div>
    );
  }

  const hasEvents = lastIdx >= 0;
  const atStart = !hasEvents || step <= 0;
  const atEnd = !hasEvents || step >= lastIdx;

  return (
    <section className="visual-stage" aria-label="Cinematic visual stage">
      <header className="visual-stage-header">
        <p className="eyebrow">Scene</p>
        <div className="visual-stage-meta">
          <span className="visual-stage-step-count">
            Step {hasEvents ? step + 1 : 0} of {Math.max(1, lastIdx + 1)}
          </span>
          {preset ? <span className="visual-stage-preset" aria-hidden="true">{preset}</span> : null}
        </div>
      </header>

      <div className="visual-stage-body">
        <div className="visual-stage-canvas" data-preset={preset ?? "none"}>
          <WorkerQueueVisual
            state={viewState}
            focus={focus}
            preset={preset}
            reducedMotion={reducedMotion}
          />
        </div>

        {snippets.length > 0 && codeRef && (
          <div className="visual-stage-snippets">
            <Suspense
              fallback={
                <div className="snippet-loading" role="status" aria-live="polite" aria-busy="true">
                  Loading code snippet…
                </div>
              }
            >
              <SceneCodeSnippet snippets={snippets} codeRef={codeRef} />
            </Suspense>
          </div>
        )}
      </div>

      <div className="visual-stage-caption" role="region" aria-label="Current step caption">
        {caption ? <p className="visual-stage-caption-text">{caption}</p> : (
          <p className="visual-stage-caption-text visual-stage-caption-empty">No caption for this step.</p>
        )}
        {narration ? <p className="visual-stage-narration">{narration}</p> : null}
      </div>

      {diagnostic ? <p role="alert">{diagnostic}</p> : null}

      {sceneSave.sceneId === sceneId && sceneSave.status === "pending" ? (
        <p role="status">Saving scene progress...</p>
      ) : null}
      {sceneSave.sceneId === sceneId && sceneSave.status === "error" ? (
        <div role="alert">
          <p>{sceneSave.error}</p>
          <button type="button" onClick={() => void saveScene(sceneInfo)}>Retry saving scene progress</button>
        </div>
      ) : null}

      {experiments.length > 0 && (
        <ExperimentTray
          experiments={experiments}
          experimentState={experimentState}
          onChange={handleExperimentChange}
        />
      )}
      {experimentSave.status === "pending" ? <p role="status">Saving experiment...</p> : null}
      {experimentSave.status === "error" ? <p role="alert">{experimentSave.error}</p> : null}

      {checkpoint && stepId && (
        <PredictionCheckpoint
          checkpoint={checkpoint}
          stepId={stepId}
          sceneId={sceneId}
          answered={answered}
          selectedOptionId={selectedOptionId}
          status={checkpointStatus.status}
          errorMessage={checkpointStatus.error}
          onSelectOption={setSelectedOptionId}
          onSubmitAnswer={handleCheckpointSubmit}
        />
      )}

      <PlaybackControls
        hasEvents={hasEvents}
        playing={playing}
        atStart={atStart}
        atEnd={atEnd}
        speed={speed}
        speeds={SPEEDS}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onPlay={handlePlay}
        onPause={handlePause}
        onReplay={handleReplay}
        onSpeedChange={handleSpeedChange}
      />

      <p
        ref={announceRef}
        className="visual-stage-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />
    </section>
  );
}
