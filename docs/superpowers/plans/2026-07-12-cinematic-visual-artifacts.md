# Cinematic Visual Artifacts Implementation Plan

> **Execution policy:** NVIDIA subagents implement all application code. GPT coordinates, reviews diffs, runs verification, and diagnoses failures. The user performs browser acceptance testing at marked checkpoints.

**Goal:** Replace the text-heavy generated artifact with a safe Cinematic Guided Learn runtime and a separately gated, domain-aware lab, beginning with Go worker queues.

**Architecture:** NVIDIA generates validated artifact v2 JSON. A trusted React runtime interprets a bounded semantic timeline through primitive reducers and fixed animation presets. Learn, experiments, contextual chat, and real code replay share canonical visual state; labs are selected by topic capability and unlocked by backend-enforced completion.

**Initial Tech Stack:** Existing Node/Express and React/Vite, Motion, CodeMirror 6, Node built-in tests. React Flow and Dagre are deferred until Phase 3.

## Execution Rules

- Work in the existing isolated worktree.
- Each task is assigned to one NVIDIA subagent with exact file scope.
- Preferred implementation order per task: GLM 5.2, DeepSeek V4 Pro, MiniMax M3, DeepSeek V4 Flash, MiniMax M2.7 when the selected agent stalls or fails.
- Every behavior change follows red-green TDD.
- GPT reviews each diff before the next dependent task begins.
- Subagents must not commit, push, change OpenCode configuration, expose secrets, or edit files outside their task.
- Preserve unrelated worktree changes.
- Use Ponytail Lite: smallest correct implementation, reuse before adding abstractions, no speculative compatibility.
- Do not add a dependency before its assigned phase.
- Generated data never contains executable frontend code.

## Review Gates

Every NVIDIA subagent returns:

- Root cause/current limitation addressed.
- Files changed.
- Tests added and commands run.
- Known limitations.

GPT then:

1. Reads the full diff.
2. Checks the task against the specification.
3. Checks security, accessibility, data bounds, and unrelated changes.
4. Runs focused tests independently.
5. Requests NVIDIA corrections if needed.
6. Runs full backend/frontend verification at phase boundaries.

---

## Phase 0: Contract And Capability Consolidation

### Task 0.1: Artifact V2 Schema And Fixtures

**NVIDIA agent:** GLM 5.2, fallback DeepSeek V4 Pro.

**Files:**

- Modify: `backend/src/artifacts/artifactSchema.js`
- Modify: `backend/test/artifact-schema-and-cache.test.js`
- Create: `backend/test/fixtures/worker-queue-v2.json`

**Deliverable:**

Add strict v2 validation for the approved envelope, worker-queue primitive state, snippets, chapters/scenes/steps, events, focus references, animation presets, checkpoints, experiments, completion rules, code lab descriptor, chat suggestions, and next topics. Preserve v1 validation only until cache invalidation is wired in Task 0.4.

**Required tests:**

- Valid fixture accepted.
- Unknown/additional fields rejected at contract boundaries.
- Duplicate IDs rejected.
- Missing target/snippet/line/option references rejected.
- Unsupported event, animation preset, experiment, checkpoint, and lab kind rejected.
- Bounds enforced for collections, text, code, files, lines, durations, and serialized size.
- Forbidden executable fields rejected recursively.
- Impossible worker-queue event sequence rejected through deterministic simulation.

**Verification:**

```powershell
node --test test/artifact-schema-and-cache.test.js
```

### Task 0.2: Shared Capability Manifest

**NVIDIA agent:** DeepSeek V4 Pro, fallback MiniMax M3.

**Files:**

- Create: `shared/artifact-capabilities.json`
- Create: `backend/src/artifacts/capabilities.js`
- Modify: `backend/src/artifacts/artifactSchema.js`
- Modify: `backend/test/artifact-schema-and-cache.test.js`
- Modify: `frontend/src/components/visuals/visualRegistry.js`
- Create: `frontend/src/lib/artifactCapabilities.js`
- Create: `frontend/src/lib/artifactCapabilities.test.js`

**Deliverable:**

Create one capability source for implemented primitive versions, semantic events, controls, animation presets, trace events, and lab kinds. Backend and frontend projections must agree. Initially advertise only implemented legacy queue support and the upcoming worker-queue v2 capability; generation must not see unimplemented kinds.

**Required tests:**

- Backend rejects capabilities absent from the manifest.
- Frontend recognizes exactly the projected manifest kinds.
- Backend/frontend projections match fixture expectations.

### Task 0.3: V2 Prompt And Repair Contract

**NVIDIA agent:** GLM 5.2, fallback DeepSeek V4 Pro.

**Files:**

- Modify: `backend/src/artifacts/promptBuilder.js`
- Modify: `backend/src/artifacts/artifactGenerator.js`
- Modify: `backend/test/artifact-generation.test.js`

**Deliverable:**

Generate v2 worker-queue artifacts from exact profile/topic/capability constraints. Prompt for visual teaching sequences and concise synchronized snippets instead of long prose. Repair prompts retain exact IDs, language, capabilities, and deterministic validation/quality errors without source Markdown or invalid response bodies.

**Required tests:**

- Prompt includes exact v2 contract, profile/topic/language, capability manifest subset, bounds, and visual-first rules.
- Prompt forbids executable frontend output.
- Repair includes stable errors and exact constraints.
- Prompt does not contain secrets, local paths, previous provider output, or unrelated capabilities.

### Task 0.4: Cache Version Cutover

**NVIDIA agent:** DeepSeek V4 Flash, fallback MiniMax M3.

**Files:**

- Modify: `backend/src/artifacts/artifactCache.js`
- Modify: `backend/src/artifacts/artifactGenerator.js`
- Modify: `backend/test/artifact-schema-and-cache.test.js`
- Modify: `backend/test/artifact-generation.test.js`

**Deliverable:**

Treat v1 generated cache entries as stale for the v2 runtime and regenerate them. Keep static legacy pack artifacts separate. Do not build a converter because there are no confirmed user-authored v1 artifacts requiring preservation.

**Required tests:**

- V2 cache hit remains a hit.
- V1 generated cache is reported stale/not-generated and is not rendered as v2.
- Regeneration writes and rereads valid v2 atomically.
- Invalid cache remains quarantined from runtime use.

### Phase 0 Verification Gate

GPT runs:

```powershell
cd backend
npm test
```

Acceptance:

- All backend tests and smoke checks pass.
- One fixture traverses schema, cache, generator, and API without weakening validation.
- No unimplemented primitive can be generated.

---

## Phase 1: Cinematic Go Worker-Queue Learn

### Task 1.1: Install Phase 1 Dependencies

**NVIDIA agent:** DeepSeek V4 Flash, fallback MiniMax M3.

**Files:**

- Modify: `frontend/package.json`
- Modify: frontend lockfile if generated by the repository package manager.

**Deliverable:**

Add only Motion and the minimum CodeMirror 6 packages needed for read-only Go snippets and line decorations. Confirm exact package imports with a build smoke test. Do not add React Flow, Dagre, XState, LangChain, LangGraph, Monaco, or a chat framework.

### Task 1.2: Worker-Queue Reducer And Timeline

**NVIDIA agent:** DeepSeek V4 Pro, fallback GLM 5.2.

**Files:**

- Create: `frontend/src/components/visuals/workerQueueState.js`
- Create: `frontend/src/components/visuals/workerQueueState.test.js`
- Create: `frontend/src/lib/sceneTimeline.js`
- Create: `frontend/src/lib/sceneTimeline.test.js`

**Deliverable:**

Implement pure worker-queue state transitions and timeline seeking. Supported events initially cover producer readiness/blocking, channel send/enqueue, worker receive/process/complete, close, and reset. Seeking to any step derives state by replay from initial state; animation is never authoritative state.

**Required tests:**

- Every supported event transition.
- Full-buffer blocking and receive unblocking.
- FIFO preservation.
- Invalid preconditions return stable diagnostics.
- Deterministic seek, previous, next, reset, and replay.
- Reduced/no-motion modes produce identical semantic state.

### Task 1.3: Cinematic Visual Stage

**NVIDIA agent:** MiniMax M3, fallback DeepSeek V4 Pro.

**Files:**

- Create: `frontend/src/components/visuals/WorkerQueueVisual.jsx`
- Create: `frontend/src/components/artifact/VisualStage.jsx`
- Create: `frontend/src/components/artifact/PlaybackControls.jsx`
- Modify: `frontend/src/components/visuals/visualRegistry.js`
- Modify: `frontend/src/styles.css`

**Deliverable:**

Build the approved dominant visual stage with producer, bounded channel, workers, jobs, semantic status, focus layer, captions, timeline, previous/next/play/pause/replay/speed, and trusted Motion presets. Keep layout responsive and preserve state when animation is interrupted.

**Accessibility:**

- Keyboard controls and visible focus.
- Polite state-change announcements.
- Labels and shapes independent of color.
- Reduced-motion and no-animation rendering.
- Semantic textual state summary.

### Task 1.4: Synchronized Read-Only Code Snippets

**NVIDIA agent:** DeepSeek V4 Flash, fallback MiniMax M3.

**Files:**

- Create: `frontend/src/components/artifact/SceneCodeSnippet.jsx`
- Create: `frontend/src/lib/snippetBindings.js`
- Create: `frontend/src/lib/snippetBindings.test.js`
- Modify: `frontend/src/components/artifact/VisualStage.jsx`
- Modify: `frontend/src/styles.css`

**Deliverable:**

Render validated snippets in read-only CodeMirror beside or within the visual stage. Highlight exact bound lines, show short annotations, and update only from the active semantic step. Snippets cannot execute, import dependencies, or inject markup.

### Task 1.5: Predictions, Experiments, And Completion

**NVIDIA agent:** GLM 5.2, fallback DeepSeek V4 Pro.

**Files:**

- Create: `frontend/src/components/artifact/PredictionCheckpoint.jsx`
- Create: `frontend/src/components/artifact/ExperimentTray.jsx`
- Create: `backend/src/memory/completion.js`
- Modify: `backend/src/memory/sessionStore.js`
- Modify: `backend/src/app.js`
- Modify: corresponding backend and frontend tests.

**Deliverable:**

Persist scene/checkpoint/experiment progress and compute Learn completion from artifact rules. Experiments dispatch allowlisted semantic events or bounded parameter changes through the same reducer. Add safe progress endpoints; do not unlock labs yet.

### Task 1.6: Contextual Tutor Drawer

**NVIDIA agent:** DeepSeek V4 Pro, fallback GLM 5.2.

**Files:**

- Modify: `frontend/src/components/artifact/ArtifactChat.jsx`
- Modify: `frontend/src/lib/productState.js`
- Modify: `frontend/src/lib/productState.test.js`
- Modify: `backend/src/app.js`
- Add/modify backend API tests.

**Deliverable:**

Keep chat secondary in a drawer. Add actions such as Explain this moment, Explain this line, Compare choices, and Why did this experiment change? Send IDs and bounded selections; backend reconstructs artifact/session context and does not trust arbitrary client context.

### Task 1.7: Replace Text-Heavy Workspace

**NVIDIA agent:** MiniMax M3, fallback DeepSeek V4 Flash.

**Files:**

- Modify: `frontend/src/components/artifact/ArtifactWorkspace.jsx`
- Modify: `frontend/src/components/ArtifactContainer.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles.css`
- Add/modify frontend state tests.

**Deliverable:**

Replace the long article layout with Learn navigation and the cinematic stage. Concise supporting material appears only when relevant to the active scene. The future Lab tab is visible as locked with a clear completion requirement. Preserve profile/topic navigation and safe failure states.

### Phase 1 Verification And Browser Gate

GPT runs:

```powershell
cd frontend
npm test
npm run build
```

Then GPT starts the correct backend/frontend worktree processes and verifies API health. The user tests in the browser:

- Desktop and narrow viewport.
- Playback and seeking.
- Prediction and experiment behavior.
- Code-line synchronization.
- Tutor context.
- Reduced/no-motion mode.
- Visual dominance and text density.

Phase 2 does not start until the user approves this browser checkpoint.

---

## Phase 2: Gated Go Code Lab And Execution Animation

### Task 2.1: Backend-Enforced Lab Gate

**NVIDIA agent:** DeepSeek V4 Pro, fallback GLM 5.2.

**Files:**

- Modify: `backend/src/memory/completion.js`
- Modify: `backend/src/memory/sessionStore.js`
- Modify: `backend/src/app.js`
- Add/modify API and session tests.

**Deliverable:**

Expose authoritative gate state and reject lab read/run/evaluate requests until completion rules pass. Persist unlock state derived from artifact version and completion evidence.

### Task 2.2: Safe Go Runner And Evaluation Contract

**NVIDIA agent:** DeepSeek V4 Pro, fallback GLM 5.2.

**Files:**

- Create: `backend/src/runners/goRunner.js`
- Create: `backend/src/runners/goTraceParser.js`
- Create: `backend/test/go-runner.test.js`
- Modify: `backend/src/app.js`
- Modify: backend API tests.

**Deliverable:**

Implement the local trusted-use Go runner with disposable workspaces, fixed commands, server-owned tests, wall-clock/output/file/process bounds available on Windows, validated trace/source events, and cleanup. Explicitly document that hosted hostile-code execution requires container/microVM isolation.

**Required tests:**

- Correct and incorrect solution.
- Compile failure.
- Timeout and excessive output.
- Malformed/unknown trace event.
- Invalid source location.
- Cleanup on every exit path.
- Locked-lab rejection before runner invocation.

### Task 2.3: Editable CodeMirror Lab

**NVIDIA agent:** DeepSeek V4 Flash, fallback MiniMax M3.

**Files:**

- Create: `frontend/src/components/labs/CodeLab.jsx`
- Create: `frontend/src/components/labs/LabRegistry.js`
- Modify: `frontend/src/lib/api.js`
- Add/modify frontend API tests.
- Modify: `frontend/src/styles.css`

**Deliverable:**

Build the separate unlocked Code Lab with problem, requirements, files, Go editor, tests, run state, diagnostics, and `Run + Animate`. It must not appear as part of the guided Learn flow.

### Task 2.4: Execution Replay And Source Highlighting

**NVIDIA agent:** MiniMax M3, fallback DeepSeek V4 Pro.

**Files:**

- Create: `frontend/src/components/labs/ExecutionReplay.jsx`
- Create: `frontend/src/lib/traceReplay.js`
- Create: `frontend/src/lib/traceReplay.test.js`
- Modify: `frontend/src/components/labs/CodeLab.jsx`
- Reuse: worker-queue reducer and visual stage.

**Deliverable:**

Map validated Go trace events to semantic runtime events. Replay through the same worker-queue visual, synchronize editor line decorations, and support event previous/next/play/pause/scrub/reset. Unknown events surface as diagnostics and never execute behavior.

### Phase 2 Verification And Browser Gate

GPT runs full backend and frontend suites and performs live correct/incorrect Go runs. The user browser-tests:

- Locked and unlocked states.
- Editing and tests.
- Run + Animate.
- Event seeking and line highlighting.
- Tutor questions about current failure/event.
- Mobile layout and accessibility basics.

---

## Phase 3: System-Design Non-Code Lab

This phase receives its own detailed plan after Phase 2 approval. Its fixed scope is:

- Add React Flow and Dagre only now.
- Implement a trusted traffic/pipeline primitive.
- Add cinematic failure, cache, queue, replication, and capacity scenes.
- Add architecture canvas, estimates, assumptions, and trade-off rubric.
- Prove one complete system-design topic without mandatory code.

## Phase 4: Framework And Data/ML Lab Adapters

This phase receives separate plans per adapter to prevent a broad rewrite:

- Profile tracks/framework selection and topic eligibility.
- One backend or frontend framework vertical slice.
- One ML, AI, or data-science experiment vertical slice.
- Domain-specific evaluators and visual primitives.

## Phase 5: Primitive Library And Generation Quality

Add one primitive per reviewed vertical slice. Each primitive must ship validator, reducer, renderer, trace mapping, accessibility output, fixtures, and tests before being advertised to generation. Add deterministic visual quality errors and reviewed few-shot fixtures. Evaluate LangGraph only if generation now requires durable resume, human approval interrupts, or multi-tool orchestration.

## Final Verification

Before declaring the initiative complete:

- Full backend tests and smoke checks pass.
- Full frontend tests and production build pass.
- Generated v2 artifact succeeds through the real provider chain.
- Browser acceptance passes for Learn and Code Lab.
- No model-generated executable frontend content is accepted.
- Secrets, prompts, generated content, and source code remain absent from logs.
- Accessibility and reduced/no-motion checks pass.
- Dependency list matches the phase policy.
- Ponytail review finds no speculative abstractions or dependencies that can be removed.
