# Cinematic Visual Artifacts Design

## Product Goal

Refract is a visual learning runtime for two visual learners. An artifact is not an article with a diagram attached. It is an interactive, animated explanation where visuals, concise text, code snippets, experiments, learner predictions, and tutor context remain synchronized.

The primary learning loop is:

1. See one causal event.
2. Read or hear why it happened.
3. Predict the next event.
4. Manipulate a bounded parameter.
5. Connect the behavior to highlighted code.
6. Complete the guided topic.
7. Unlock the appropriate domain lab.
8. Apply the concept and replay the result visually.

## Non-Goals

- Model-generated HTML, JSX, JavaScript, CSS, React components, animation code, or package names.
- A generic no-code page builder or arbitrary animation editor.
- Treating every topic as a LeetCode problem.
- Simulating the full Go scheduler or claiming one trace represents every possible schedule.
- Adding LangChain, LangGraph, XState, React Flow, or other dependencies before their phase needs them.
- Replacing the artifact with a chat-first interface.
- Supporting every domain before one excellent vertical slice proves the runtime.

## Experience Structure

### Learn

Learn contains only guided learning. Its dominant surface is the Cinematic Guided Lab.

Each topic is divided into chapters, scenes, and semantic steps. A step may change visual state, focus an object, highlight code, narrate a cause, ask for a prediction, or enable an experiment. The learner controls time with previous, next, play, pause, replay, and speed controls.

Read-only code snippets are first-class scene content. The active line highlights when its semantic event occurs. Visual objects and annotations connect the line to the resulting state change. Snippets may show the profile language plus relevant SQL, configuration, markup, or shell content.

Learn includes contextual tutor access, but chat remains secondary and references the current scene instead of becoming a separate generic conversation.

### Lab

Lab is a separate section. It unlocks only after the topic's completion rules are satisfied. The backend and session store enforce the gate; frontend hiding alone is insufficient.

The lab depends on the topic capability rather than assuming editable code:

| Domain/topic type | Lab experience | Primary evaluation |
|---|---|---|
| DSA/algorithm | Code editor, tests, complexity checks, execution animation | Unit tests and trace contract |
| System design | Architecture canvas, traffic/failure simulation, estimates, trade-offs | Structural constraints and rubric |
| Backend framework | Multi-file service task, request/database flow, contract tests | HTTP/database tests and rubric |
| Frontend framework | Component task, state/render flow, browser and accessibility checks | Browser tests and accessibility |
| ML | Dataset and training pipeline experiment | Reproducibility and metric thresholds |
| AI | Prompt, retrieval, or agent evaluation task | Dataset-based evaluations and rubric |
| Data science | SQL/dataframe analysis and chart interpretation | Expected outputs and analytical rubric |

For coding labs, `Run + Animate` executes the learner's real code in a constrained runner, validates structured trace events, highlights source lines, and replays those events through the same visual primitive used by Learn.

## First Vertical Slice

The first complete topic is Go concurrency with worker queues and buffered channels.

Learn must teach:

1. Producer, channel buffer, worker, and job roles.
2. FIFO queue behavior.
3. Buffered channel capacity.
4. Producer blocking when the channel is full.
5. Worker receive unblocking a producer.
6. Capacity versus throughput.
7. Worker count and processing-speed experiments.
8. Relevant Go send, receive, range, close, and synchronization snippets.

The gated Code Lab must provide:

- A Go editor.
- A focused worker-queue task.
- Tests and safe evaluation.
- Structured semantic trace capture.
- Source-line mapping.
- Event playback through the worker-queue visual.
- A concise explanation for each replayed state change.

## Runtime Architecture

```text
curated source + profile + topic capabilities
                 |
                 v
        NVIDIA artifact generation
                 |
                 v
      v2 schema + quality validation
                 |
                 v
         validated artifact cache
                 |
                 v
        Cinematic Artifact Runtime
       /          |          \
 scene timeline  primitive   tutor context
       |          reducer          |
       +----------+----------------+
                  |
                  v
       Learn / experiment / lab trace
```

The model authors bounded instructional data. The trusted application owns reducers, layout, animations, controls, accessibility, execution, and validation.

### Frontend Components

```text
ArtifactExperience
|- ExperienceHeader
|- LearnExperience
|  |- SceneProgress
|  |- VisualStage
|  |  |- PrimitiveRenderer
|  |  |- AnnotationLayer
|  |  |- CodeSnippetLayer
|  |  `- CaptionLayer
|  |- PlaybackControls
|  |- PredictionCheckpoint
|  `- ExperimentTray
|- LabExperience
|  |- DomainLabRegistry
|  |- CodeLab / SystemDesignLab / ExperimentLab
|  `- ExecutionReplay
`- ContextualTutorDrawer
```

One runtime controller owns canonical visual state and the active semantic step. Components do not maintain disconnected live, replay, and guided copies of primitive state.

### Primitive Contract

Each trusted primitive provides:

```text
validateSpec(spec)
reduce(state, semanticEvent)
deriveView(state, activeStep)
mapTraceEvent(traceEvent)
supportedEvents
supportedControls
supportedAnimationPresets
render(viewModel)
describeState(state)
```

The first primitive is `worker-queue`. Later primitives are added only with validator, reducer, renderer, trace mapper, accessibility representation, fixtures, and tests.

## Artifact V2 Contract

The exact schema will be implemented and tested in Phase 0. This example defines the intended boundaries:

```json
{
  "schemaVersion": 2,
  "artifactVersion": 1,
  "profileId": "sandeep-...",
  "topicId": "backend.go.concurrency",
  "title": "When a Go Worker Queue Fills",
  "learningObjectives": [
    "Explain why a send to a full buffered channel blocks",
    "Distinguish channel capacity from worker throughput"
  ],
  "experience": {
    "mode": "guided-lab",
    "primitive": {
      "kind": "worker-queue",
      "specVersion": 1,
      "initialState": {
        "producer": { "id": "producer-1", "status": "ready" },
        "channel": { "id": "jobs", "capacity": 3, "items": [] },
        "workers": [{ "id": "worker-1", "status": "idle" }]
      }
    },
    "snippets": [
      {
        "id": "send-loop",
        "language": "go",
        "file": "main.go",
        "code": "for _, job := range jobs {\n    queue <- job\n}",
        "editable": false,
        "annotations": [{ "line": 2, "text": "This send waits when the buffer is full." }]
      }
    ],
    "chapters": [
      {
        "id": "backpressure",
        "title": "Backpressure",
        "scenes": [
          {
            "id": "buffer-fills",
            "title": "The producer gets ahead",
            "steps": [
              {
                "id": "send-job-3",
                "event": {
                  "type": "channel.send",
                  "target": "jobs",
                  "payload": { "item": { "id": "job-3", "label": "J3" } }
                },
                "focus": ["producer-1", "jobs", "job-3"],
                "snippet": { "id": "send-loop", "lines": [2] },
                "caption": "J3 occupies the final buffer slot.",
                "narration": "The channel can now hold no more waiting jobs.",
                "animationPreset": "enqueue-from-producer"
              },
              {
                "id": "send-blocks",
                "event": {
                  "type": "channel.send-blocked",
                  "target": "producer-1",
                  "payload": { "item": { "id": "job-4", "label": "J4" } }
                },
                "focus": ["producer-1", "jobs"],
                "snippet": { "id": "send-loop", "lines": [2] },
                "caption": "The next send waits.",
                "narration": "A send to a full buffered channel blocks until a worker receives a job.",
                "animationPreset": "show-blocked",
                "checkpoint": {
                  "kind": "prediction",
                  "question": "What lets the producer continue?",
                  "options": [
                    { "id": "receive", "label": "A worker receives a job" },
                    { "id": "time", "label": "Time passes automatically" }
                  ],
                  "answer": "receive",
                  "explanation": "Receiving frees one channel slot."
                }
              }
            ]
          }
        ]
      }
    ],
    "experiments": [
      { "id": "worker-count", "kind": "bounded-number", "min": 1, "max": 4, "step": 1, "default": 1 },
      { "id": "channel-capacity", "kind": "bounded-number", "min": 0, "max": 8, "step": 1, "default": 3 }
    ],
    "completionRules": [
      { "kind": "required-scenes", "sceneIds": ["buffer-fills"] },
      { "kind": "required-checkpoints", "stepIds": ["send-blocks"] }
    ]
  },
  "lab": {
    "kind": "code",
    "language": "go",
    "title": "Build a fair worker queue",
    "files": [{ "path": "main.go", "starterCode": "package main\n" }],
    "evaluation": { "kind": "go-tests", "testSetId": "worker-queue-v1" },
    "trace": {
      "supportedEvents": ["channel.send", "channel.send-blocked", "worker.receive", "worker.complete"],
      "sourceMapRequired": true
    }
  },
  "chat": {
    "suggestedQuestions": ["Why is the producer blocked?", "Does a larger buffer improve throughput?"]
  },
  "next": ["system-design.queue-backpressure"]
}
```

## Validation And Quality Gates

Validation rejects artifacts with:

- Unknown primitive, event, control, animation preset, checkpoint, or lab kind.
- Duplicate or malformed IDs.
- References to missing targets, snippets, lines, scenes, steps, options, or topics.
- Events that violate primitive preconditions when simulated from initial state.
- Unsupported language, framework, runner, or trace event.
- Out-of-bounds counts, durations, payloads, captions, narration, source files, or serialized size.
- Executable frontend content or forbidden nested fields.
- Completion rules that cannot be satisfied.
- A prediction answer not present in its options.
- A lab incompatible with topic capabilities.

Deterministic quality gates reject technically valid but weak artifacts when:

- The visual does not change during most steps.
- The visual is not the primary first surface.
- A chapter has no learner prediction or interaction.
- Explanations exceed visual-first length limits.
- A code snippet is shown without a scene/line binding.
- Controls do not affect visible state.
- The sequence lacks a meaningful causal progression.
- Reduced-motion and textual state descriptions cannot be produced.

## Progression And Gating

Session state records:

- Active chapter, scene, and step.
- Completed required scenes.
- Checkpoint attempts and completion.
- Experiment interactions.
- Current canonical visual state.
- Learn completion timestamp.
- Lab unlock state.
- Lab files, evaluation result, trace events, and replay position.
- Contextual chat summary and recent messages.

The backend computes gate state from validated completion rules and persisted progress. The frontend requests gate state and cannot run or evaluate a locked lab.

## Contextual Tutor

The tutor request contains bounded, validated context:

```json
{
  "profileId": "...",
  "topicId": "backend.go.concurrency",
  "domain": "backend",
  "framework": "go",
  "activeSceneId": "buffer-fills",
  "activeStepId": "send-blocks",
  "selectedEntityIds": ["producer-1", "jobs"],
  "selectedSnippetId": "send-loop",
  "selectedLines": [2],
  "checkpoint": { "kind": "prediction", "selectedOptionId": "time" },
  "experimentState": { "worker-count": 1, "channel-capacity": 3 },
  "lab": { "kind": "code", "latestEvaluationId": null },
  "question": "Why does waiting not unblock it?"
}
```

The backend reconstructs authoritative artifact and session context rather than trusting arbitrary client-supplied prompt content. NVIDIA models answer tutor requests through the existing ordered fallback provider.

## Code Execution And Trace Safety

The current local runner is not sufficient as a hostile-code sandbox. The Go Code Lab requires:

- A fixed Go toolchain and allowlisted command.
- Disposable workspace.
- Strict wall-clock, CPU, memory, process-count, output, and file-size limits.
- Network disabled by default.
- No access to application secrets or host project files.
- Predefined server-owned tests.
- Structured trace events validated independently of stdout.
- Source locations bounded to known lab files and lines.
- Cleanup after success, failure, timeout, or cancellation.

For local trusted use, platform limitations must be explicit. Hosted or multi-user deployment requires container or microVM isolation before accepting arbitrary code.

## Accessibility And Responsive Behavior

- Every visual state has a semantic textual description.
- Important changes use a polite live region; routine animation does not spam announcements.
- Playback, predictions, experiments, snippets, chat, and labs are keyboard operable.
- Captions and transcripts accompany narration.
- Reduced-motion mode uses fades, focus outlines, and stable snapshots.
- No-animation mode provides illustrated step cards and preserves all information.
- Color is reinforced with labels, shape, and iconography.
- Mobile keeps the visual first, places explanation below it, and moves secondary controls/chat into drawers.

## Open-Source Dependencies

Dependencies are introduced only when their phase begins:

| Dependency | Phase | Purpose |
|---|---:|---|
| Motion | 1 | Trusted choreography, enter/exit/layout transitions, reduced-motion support |
| CodeMirror 6 | 1 for read-only snippets, 2 for editor | Syntax highlighting, execution-line decorations, editing |
| React Flow + Dagre | 3 | Trusted system-design and framework graph primitives |
| XState | Deferred | Only if reducer-based runtime develops demonstrable invalid-state complexity |
| LangChain/LangGraph | Deferred | Only for genuine durable multi-stage model workflows; neither renders artifacts |

The tutor remains custom and secondary; a chat UI framework is unnecessary in the initial phases.

## Migration

Artifact schema v1 becomes legacy when v2 launches. Because the current product is local and early-stage, v1 generated caches are invalidated and regenerated by default. A migration is added only if user-created persisted artifacts require preservation. The runtime does not carry indefinite speculative compatibility.

## Model And Agent Roles

- NVIDIA models generate artifact JSON, tutor responses, and code-oriented content through the backend provider chain.
- NVIDIA OpenCode subagents implement application code task by task.
- GPT writes plans, reviews changes, diagnoses integration problems, and verifies results. GPT does not write implementation code for this initiative.
- The user performs browser acceptance testing at planned checkpoints.
- Superpowers governs process, debugging, TDD, and verification. Ponytail Lite constrains implementation complexity without overriding explicit requirements or safety.

## Delivery Phases

### Phase 0: Contract And Capability Consolidation

Deliverables:

- One v2 artifact contract and capability manifest.
- Primitive-specific worker-queue state/event validation.
- Prompt and repair contract aligned with v2.
- Cache version behavior and v1 invalidation.
- Shared backend/frontend capability source or generated projection.

Acceptance:

- Invalid references and impossible event sequences fail before cache.
- Generation cannot request unimplemented primitives or actions.
- Fixtures prove one valid v2 worker-queue artifact end to end.

### Phase 1: Cinematic Go Worker-Queue Learn

Deliverables:

- Dominant visual stage.
- Worker-queue reducer and renderer.
- Guided scene playback and experiments.
- Synchronized read-only Go snippets.
- Prediction checkpoints and completion tracking.
- Contextual tutor drawer.
- Keyboard, transcript, reduced-motion, no-animation, and responsive behavior.

Acceptance:

- A learner can explain blocking and capacity versus throughput without reading a long article.
- The first visual appears immediately and the first learner action occurs within 30 seconds.
- Visual, explanation, snippet line, and tutor context stay on the same semantic step.
- Browser acceptance passes on desktop and mobile widths.

### Phase 2: Gated Go Code Lab

Deliverables:

- Backend-enforced Learn gate.
- CodeMirror editor and server-owned tests.
- Safe Go runner boundary.
- Structured trace/source mapping.
- `Run + Animate` execution replay through the worker-queue primitive.

Acceptance:

- Locked lab requests are rejected by the backend.
- A correct and incorrect Go solution produce deterministic evaluations.
- Valid trace events animate and highlight the correct source lines.
- Malformed traces, excessive output, timeout, and unsupported code fail safely.

### Phase 3: System-Design Lab Proof

Deliverables:

- Traffic/pipeline graph primitive using React Flow and Dagre.
- Failure, queue, cache, replication, and capacity scenes.
- Architecture canvas and trade-off/capacity rubric lab.
- No mandatory coding contract for system-design topics.

Acceptance:

- One system-design topic completes Learn and a non-code lab end to end.
- Evaluation measures architecture and rationale rather than process exit status.

### Phase 4: Framework And Data Lab Adapters

Deliverables:

- Profile tracks and framework selection.
- Backend/frontend project lab adapter.
- ML/AI/data-science experiment lab adapter.
- Domain-aware curriculum metadata and evaluator contracts.

Acceptance:

- At least one framework topic and one data/ML topic use distinct appropriate labs.
- Neither is forced into the DSA/LeetCode schema.

### Phase 5: Primitive Library And Generation Quality

Deliverables:

- Additional primitives shipped one vertical slice at a time.
- Quality scoring and repair errors for weak visual artifacts.
- Reviewed fixture library for generation examples.
- Optional durable orchestration evaluation if generation now warrants LangGraph.

Acceptance:

- Every advertised primitive has validator, reducer, renderer, trace mapper, accessibility output, fixtures, and tests.
- Generated artifacts meet deterministic visual-change and interaction thresholds.
