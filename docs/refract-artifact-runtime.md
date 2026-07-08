# Refract Artifact Runtime Agreement

## 1. Product Definition

Refract is an AI artifact learning workbench.

A Refract Artifact is a self-contained interactive learning unit. It combines explanation, simulation, code practice, test execution, trace replay, and AI tutoring around one concept.

A Refract Artifact is not a normal lesson. A lesson usually presents content in a linear sequence. An artifact is an active workspace. The student can read, manipulate, code, run, inspect, and ask for help inside the same unit.

A Refract Artifact is not a dashboard. The product should not start with metrics, menus, provider choices, or course management. It should start with one artifact and one clear action.

The first target user is beginner/sister mode:

- No API key screens by default.
- No provider jargon by default.
- No setup prompts by default.
- No terminal assumptions.
- The app should just work when the backend is configured.
- If AI is unavailable, the app shows a plain message and keeps the artifact usable.

The first artifact is:

```text
Queue / Payment Retry Queue
```

Later artifacts, after Queue is working end to end:

```text
Stack / Browser History
HashMap / Cache
```

DSA, system design, and game theory are lenses inside one artifact. They are not separate top-level apps or separate pages for v1.

## 2. Repo Structure

The product code is organized as:

```text
packs/      artifact content
backend/    API, code runner, AI provider routing
frontend/   real product UI
canvas/     old reference/dev tool only
docs/       specs and standards
```

### `packs/`

Contains versioned artifact content. The first pack is:

```text
packs/dsa-sd-gt/
```

The first artifact file is:

```text
packs/dsa-sd-gt/queue.json
```

Artifact JSON is the source of truth for artifact content, lens copy, practice starter code, tests, visual configuration, rubric, and next artifact pointer.

### `backend/`

Contains the API server, code runners, trace parsing, progress storage, and AI provider routing.

The backend owns all provider secrets. The frontend must never contain managed provider keys.

### `frontend/`

Contains the real product UI for beginner/sister mode.

The frontend renders artifacts from the backend. It must not hardcode provider setup into the default user flow.

### `canvas/`

`canvas/` is old reference/dev tooling only.

Do not keep patching `canvas/` into the product. Useful ideas and rendering primitives may be ported into the new runtime, but the old `canvas/` UI is not the foundation for `frontend/`.

### `docs/`

Contains product and engineering contracts. This file defines the artifact runtime agreement for Phase 1 and later work.

## 3. Artifact Lifecycle

Each artifact has one container with four tabs:

```text
Story
Explore
Practice
Review
```

The tabs are part of the artifact lifecycle. They should feel like one workspace, not four unrelated pages.

### Story Tab

Purpose:

- Explain the artifact concept in beginner-friendly language.
- Show the core visual model.
- Introduce the three lenses: DSA, system design, and game theory.
- Give the student one obvious next action, usually to try Explore.

Must contain:

- Artifact title.
- Short story/context.
- Lens summaries.
- A non-code concept visual.

Must not contain:

- API key prompts.
- Provider/model settings.
- Long dashboard metrics.
- Code editor as the primary element.
- Admin or teacher controls.

### Explore Tab

Purpose:

- Let the student manipulate the concept before coding.
- Show cause and effect through the canvas runtime.
- Emit structured interaction events that the tutor can use as context.

Must contain:

- Interactive simulation controls.
- Current visual state.
- Clear labels for each action.

For Queue, expected controls include:

- Enqueue item.
- Dequeue item.
- Adjust worker speed or retry pressure where relevant.
- Reset simulation.

Must not contain:

- Full code editor.
- Test runner.
- Provider settings.
- Unclear controls that require prior terminal or backend knowledge.

### Practice Tab

Purpose:

- Let the student implement the artifact concept in code.
- Run tests on the backend.
- Show test output and trace-driven animation side by side.

Desktop layout:

```text
┌──────────────────────────┬──────────────────────────┐
│ Code editor + test output│ Visual trace replay      │
│ Run Tests / Hint / Review│ Play / Step / Reset      │
└──────────────────────────┴──────────────────────────┘
```

Must contain:

- Language selector for supported languages in the artifact.
- Code editor.
- Run Tests button.
- Test result panel.
- Trace replay canvas.
- Play, step, and reset controls for trace replay.
- A clear route to ask for a hint or review.

Must not contain:

- API key setup.
- Provider dropdowns.
- Fake passing states before tests actually run.
- Hidden test failures.
- Unbounded execution or arbitrary shell access.

### Review Tab

Purpose:

- Summarize the student's current attempt.
- Show rubric results.
- Explain mistakes and next steps.
- Help the student try again.

Must contain:

- Latest run result summary.
- Rubric dimensions and scores when available.
- AI feedback when available.
- Clear fallback message when AI is unavailable.
- Try Again action returning to Practice.
- Next artifact pointer when the current artifact is complete.

Must not contain:

- Provider setup as the default path.
- Claims that AI reviewed code if no AI provider ran.
- Teacher/admin workflows.
- Multi-student analytics.

## 4. Artifact JSON Schema v1

Artifact content is JSON. It is not free-form React.

Schema changes must update this section before implementation changes rely on them.

### Required top-level fields

```text
schemaVersion       number, currently 1
id                  string, stable artifact id
pack                string, pack id
title               string, display title
summary             string, one-sentence concept summary
level               string, beginner/intermediate/advanced; v1 starts beginner
lenses              object with dsa, system_design, game_theory
tabs                array, must include story/explore/practice/review
canvas              object, visual and interaction contract
practice            object, language-specific starter code and tests
rubric              array, review dimensions
next                string or null, next artifact id
```

### Concrete Queue Artifact Example

```json
{
  "schemaVersion": 1,
  "id": "queue",
  "pack": "dsa-sd-gt",
  "title": "Payment Retry Queue",
  "summary": "Use a queue to retry failed payments in the order they arrived.",
  "level": "beginner",
  "lenses": {
    "dsa": {
      "title": "Queue",
      "angle": "FIFO structure, enqueue, dequeue, peek, and empty state.",
      "studentTakeaway": "The first item added is the first item removed."
    },
    "system_design": {
      "title": "Retry Pipeline",
      "angle": "A payment retry queue protects workers from bursts and keeps failed payments ordered.",
      "studentTakeaway": "Queues help systems handle work at a safe pace."
    },
    "game_theory": {
      "title": "Congestion and Fairness",
      "angle": "Selfish producers can overload shared workers unless the queue has fair ordering and backpressure.",
      "studentTakeaway": "Fair ordering changes how users and services compete for limited processing."
    }
  },
  "tabs": ["story", "explore", "practice", "review"],
  "story": {
    "context": "A payment service needs to retry failed charges without losing order or flooding the worker.",
    "goal": "Understand why FIFO order matters before writing the queue."
  },
  "canvas": {
    "storyVisual": {
      "kind": "queue",
      "title": "Payment retry queue",
      "items": ["pay_101", "pay_102", "pay_103"],
      "frontLabel": "next retry",
      "backLabel": "new failure"
    },
    "exploreSpec": {
      "kind": "queue",
      "interactive": true,
      "initialItems": ["pay_101", "pay_102"],
      "controls": [
        { "type": "enqueue", "label": "Add failed payment" },
        { "type": "dequeue", "label": "Retry next payment" },
        { "type": "slider", "param": "workerSpeed", "label": "Worker speed", "min": 1, "max": 3, "default": 1 },
        { "type": "reset", "label": "Reset" }
      ]
    },
    "traceReplay": {
      "kind": "queue",
      "supportedEvents": [
        "queue.enqueue",
        "queue.dequeue",
        "queue.peek",
        "queue.empty"
      ]
    }
  },
  "practice": {
    "defaultLanguage": "python",
    "languages": ["python", "java"],
    "python": {
      "starterCode": "class PaymentRetryQueue:\n    def __init__(self):\n        self.items = []\n\n    def enqueue(self, payment_id):\n        # Add payment_id to the back of the queue.\n        pass\n\n    def dequeue(self):\n        # Remove and return the front payment_id.\n        pass\n\n    def peek(self):\n        # Return the next payment_id without removing it.\n        pass\n\n    def is_empty(self):\n        return len(self.items) == 0\n",
      "tests": "q = PaymentRetryQueue()\nassert_equal(q.is_empty(), True, 'new queue starts empty')\nq.enqueue('pay_101')\nq.enqueue('pay_102')\nassert_equal(q.peek(), 'pay_101', 'peek returns front item')\nassert_equal(q.dequeue(), 'pay_101', 'dequeue returns first item')\nassert_equal(q.dequeue(), 'pay_102', 'dequeue returns second item')\nassert_equal(q.is_empty(), True, 'queue is empty after removing all items')\n",
      "traceHelper": "event('queue.enqueue', value=payment_id, label=payment_id)"
    },
    "java": {
      "starterCode": "class PaymentRetryQueue {\n    private java.util.Queue<String> items = new java.util.LinkedList<>();\n\n    void enqueue(String paymentId) {\n        // Add paymentId to the back of the queue.\n    }\n\n    String dequeue() {\n        // Remove and return the front paymentId.\n        return null;\n    }\n\n    String peek() {\n        // Return the next paymentId without removing it.\n        return null;\n    }\n\n    boolean isEmpty() {\n        return items.isEmpty();\n    }\n}\n",
      "tests": "PaymentRetryQueue q = new PaymentRetryQueue();\nTraceAssert.equal(q.isEmpty(), true, \"new queue starts empty\");\nq.enqueue(\"pay_101\");\nq.enqueue(\"pay_102\");\nTraceAssert.equal(q.peek(), \"pay_101\", \"peek returns front item\");\nTraceAssert.equal(q.dequeue(), \"pay_101\", \"dequeue returns first item\");\nTraceAssert.equal(q.dequeue(), \"pay_102\", \"dequeue returns second item\");\nTraceAssert.equal(q.isEmpty(), true, \"queue is empty after removing all items\");\n",
      "traceHelper": "RefractTrace.event(\"queue.enqueue\", \"value\", paymentId, \"label\", paymentId);"
    }
  },
  "rubric": [
    { "dimension": "logic", "label": "Queue logic", "weight": 40 },
    { "dimension": "edge_cases", "label": "Empty queue and peek cases", "weight": 30 },
    { "dimension": "trace_usage", "label": "Trace events are useful", "weight": 20 },
    { "dimension": "clarity", "label": "Readable code", "weight": 10 }
  ],
  "next": "stack"
}
```

Notes for implementers:

- The example shows the intended shape. Phase 1 may use this exact content or a shortened version if tests stay equivalent.
- `starterCode` and `tests` are strings so artifacts remain portable JSON.
- The backend is responsible for injecting safe trace and assertion helpers before execution.
- The frontend must not invent a separate artifact shape.
- Artifact schema may include Python and Java fields, but Phase 1 backend only requires Python execution for Queue. Java execution is later unless explicitly requested.

## 5. Canvas Runtime Contract

The canvas runtime renders artifact visuals from structured artifact fields. It should not require arbitrary React components in artifact JSON.

For v1, the canvas runtime must support Queue visuals for:

- Story visual.
- Explore simulation.
- Practice trace replay.

The runtime must render:

- A queue with visible front and back.
- Item labels.
- Empty state.
- Enqueue and dequeue changes.
- Trace step highlighting during Practice replay.

The Explore tab must emit structured student interaction events.

Event examples:

```json
{ "type": "student.enqueue", "value": "A" }
```

```json
{ "type": "student.dequeue" }
```

```json
{ "type": "student.explore", "param": "workerSpeed", "value": 2 }
```

Canvas event rules:

- Events are plain JSON objects.
- Events must include a `type` string.
- Student interaction event names use the `student.*` namespace.
- Artifact state changes caused by events must be visible on the canvas.
- The frontend may store recent canvas events and send them to the tutor as context.
- Canvas events must not execute code or call providers directly.

## 6. Trace Protocol

Student code emits trace lines to stdout. The backend parses those lines and returns trace events to the frontend.

Trace line format:

```text
REFRACT_TRACE: {"type":"queue.enqueue","value":"A","label":"A","meta":{}}
```

Rules:

- A trace line starts with `REFRACT_TRACE:`.
- The text after the prefix must be valid JSON.
- The parsed JSON must include a `type` string.
- Malformed trace lines must not crash the run.
- Malformed trace lines should be reported in visible output or run diagnostics.
- Normal stdout must be preserved separately from trace events.
- Trace events are for visualization and review context. Passing tests must not depend only on trace events.

### Python Helper

The backend injects a helper equivalent to:

```python
import json

def event(event_type, **kwargs):
    print("REFRACT_TRACE: " + json.dumps({"type": event_type, **kwargs}), flush=True)
```

A Python queue implementation can call:

```python
event("queue.enqueue", value=payment_id, label=payment_id)
event("queue.dequeue", value=payment_id, label=payment_id)
event("queue.peek", value=payment_id, label=payment_id)
event("queue.empty")
```

### Java Helper

The backend injects a helper equivalent to:

```java
RefractTrace.event("queue.enqueue", "value", value);
```

The helper must support key/value payload arguments and produce one `REFRACT_TRACE:` JSON line.

A Java queue implementation can call:

```java
RefractTrace.event("queue.enqueue", "value", paymentId, "label", paymentId);
RefractTrace.event("queue.dequeue", "value", paymentId, "label", paymentId);
RefractTrace.event("queue.peek", "value", paymentId, "label", paymentId);
RefractTrace.event("queue.empty");
```

### Queue Trace Event Types

For Queue v1, supported trace event types are:

```text
queue.enqueue
queue.dequeue
queue.peek
queue.empty
```

Event payload conventions:

- `value`: primary queue item value, when applicable.
- `label`: display label, when applicable.
- `meta`: optional object for non-visual context.

## 7. Backend API Contract

The backend is a Node/Express API.

All endpoints return JSON, except streaming AI endpoints which may use Server-Sent Events or another documented streaming response. Streaming transport is optional in Phase 1. If streaming is unavailable in Phase 1, the endpoint may return one JSON response with the same final payload shape, but the route names stay the same.

AI response compatibility rules:

- The frontend must consume a normalized final payload shape.
- The same final payload fields must exist whether the transport is streaming or non-streaming.
- UI correctness must not depend on token streaming.
- Token streaming is a presentation detail, not a product requirement for Phase 1.

### `GET /health`

Returns runtime and provider status without exposing secrets.

Response:

```json
{
  "ok": true,
  "service": "refract-backend",
  "version": "0.1.0",
  "runtimes": {
    "python": true,
    "java": false
  },
  "ai": {
    "managedProviderConfigured": true,
    "codexBridgeEnabled": false,
    "codexBridgeAvailable": false,
    "ollamaEnabled": false
  }
}
```

Rules:

- Do not include API keys.
- Do not include auth file paths.
- Report missing runtimes honestly.

### `GET /artifacts/:id`

Returns one artifact JSON document.

Example:

```text
GET /artifacts/queue
```

Success response:

```json
{
  "id": "queue",
  "pack": "dsa-sd-gt",
  "title": "Payment Retry Queue",
  "tabs": ["story", "explore", "practice", "review"]
}
```

The real response includes the full Artifact JSON Schema v1 document.

Not found response:

```json
{
  "error": "Artifact not found"
}
```

Status code: `404`.

### `POST /run`

Runs student code for one artifact and language.

Request:

```json
{
  "artifactId": "queue",
  "language": "python",
  "code": "class PaymentRetryQueue:\n    pass\n",
  "studentId": "local-student"
}
```

Success response:

```json
{
  "success": true,
  "artifactId": "queue",
  "language": "python",
  "tests": [
    { "name": "queue starts empty", "passed": true },
    { "name": "dequeue returns FIFO order", "passed": true }
  ],
  "stdout": "",
  "stderr": "",
  "traceEvents": [
    { "type": "queue.enqueue", "value": "pay_101", "label": "pay_101" },
    { "type": "queue.dequeue", "value": "pay_101", "label": "pay_101" }
  ],
  "summary": "All queue tests passed."
}
```

Phase 1 may return a simpler run result while the test harness is still basic:

```json
{
  "success": true,
  "artifactId": "queue",
  "language": "python",
  "stdout": "",
  "stderr": "",
  "traceEvents": [],
  "summary": "All queue tests passed."
}
```

Named per-test results are desirable, but not required until a structured test harness exists.

Failure response with tests run:

```json
{
  "success": false,
  "artifactId": "queue",
  "language": "python",
  "tests": [
    { "name": "dequeue returns FIFO order", "passed": false, "message": "expected pay_101, got pay_102" }
  ],
  "stdout": "",
  "stderr": "",
  "traceEvents": [],
  "summary": "One test failed. Check FIFO ordering."
}
```

Unsupported language response:

```json
{
  "success": false,
  "status": "unsupported_language",
  "message": "Artifact queue does not support rust. Supported languages: python, java."
}
```

Rules:

- The backend loads tests from the artifact. The client does not send tests.
- Phase 1 only requires Python Queue execution. Java fields may exist in artifact JSON, but Java runner execution is later unless explicitly pulled forward.
- Student code execution must have a timeout.
- Student code output must have size limits.
- Student code must run in a temporary workspace.
- The backend must clean up temporary workspaces.
- The frontend must never claim tests passed unless `/run` returned `success: true`.

### `POST /ai/stream/explain`

Asks the tutor to explain artifact content or current tab context.

Request:

```json
{
  "artifactId": "queue",
  "studentId": "local-student",
  "tab": "story",
  "question": "Why does FIFO matter here?",
  "canvasEvents": []
}
```

Final payload shape:

```json
{
  "status": "ok",
  "message": "FIFO matters because the oldest failed payment should be retried first...",
  "provider": "managed"
}
```

Unavailable response:

```json
{
  "status": "not_configured",
  "message": "AI tutor is unavailable because no backend provider is configured. You can still use the artifact and run tests."
}
```

### `POST /ai/stream/hint`

Asks the tutor for a hint without giving away the full solution.

Request:

```json
{
  "artifactId": "queue",
  "studentId": "local-student",
  "language": "python",
  "code": "class PaymentRetryQueue:\n    pass\n",
  "runResult": {
    "success": false,
    "summary": "dequeue returned the wrong item"
  }
}
```

Final payload shape:

```json
{
  "status": "ok",
  "message": "Look at which end of the list you remove from. FIFO removes the oldest item, not the newest one.",
  "provider": "managed"
}
```

### `POST /ai/stream/evaluate`

Asks the tutor to review the latest attempt against the artifact rubric.

Request:

```json
{
  "artifactId": "queue",
  "studentId": "local-student",
  "language": "python",
  "code": "class PaymentRetryQueue:\n    ...\n",
  "runResult": {
    "success": true,
    "summary": "All queue tests passed.",
    "traceEvents": []
  }
}
```

Final payload shape:

```json
{
  "status": "ok",
  "provider": "managed",
  "summary": "Your queue logic is correct.",
  "rubric": [
    { "dimension": "logic", "score": 40, "max": 40, "comment": "FIFO behavior works." },
    { "dimension": "edge_cases", "score": 25, "max": 30, "comment": "Empty queue behavior is mostly clear." },
    { "dimension": "trace_usage", "score": 15, "max": 20, "comment": "Add a trace event for empty dequeue." },
    { "dimension": "clarity", "score": 10, "max": 10, "comment": "Readable names." }
  ],
  "nextStep": "Try Stack / Browser History next."
}
```

Unavailable response:

```json
{
  "status": "not_configured",
  "message": "AI review is unavailable because no backend provider is configured. Your test results are still valid."
}
```

### `GET /progress/:studentId`

Returns local progress for one student id.

Response:

```json
{
  "studentId": "local-student",
  "completedArtifacts": [
    {
      "artifactId": "queue",
      "language": "python",
      "completedAt": "2026-07-02T12:00:00.000Z"
    }
  ],
  "lastArtifactId": "queue"
}
```

If no progress exists, return an empty progress object rather than an error:

```json
{
  "studentId": "local-student",
  "completedArtifacts": [],
  "lastArtifactId": null
}
```

### `POST /progress/:studentId`

Stores progress after meaningful events, usually after a successful run or completed review.

Request:

```json
{
  "artifactId": "queue",
  "language": "python",
  "event": "artifact_completed",
  "timestamp": "2026-07-02T12:00:00.000Z"
}
```

Response:

```json
{
  "studentId": "local-student",
  "completedArtifacts": [
    {
      "artifactId": "queue",
      "language": "python",
      "completedAt": "2026-07-02T12:00:00.000Z"
    }
  ],
  "lastArtifactId": "queue"
}
```

Rules:

- v1 progress is JSON-file storage under the backend data directory.
- No external database in v1.
- v1 does not require accounts or multi-tenant auth.
- Do not store API keys in progress.

## 8. AI Provider Chain

Beginner/sister mode uses the backend-managed provider by default.

Default frontend behavior:

- Do not show key screens.
- Do not show provider dropdowns.
- Do not show model names.
- Do not use BYOK language.
- If AI is unavailable, show a plain unavailable message and keep non-AI artifact features working.

Default beginner-mode provider resolution:

```text
1. Managed backend provider from environment variables, if configured
2. Local Codex bridge, only if explicitly enabled and the managed provider is unavailable or disabled
3. Local Ollama, later only if enabled and healthy
4. Clean AI unavailable response
```

For v1, the primary expected provider is the managed backend provider.

Advanced mode rule:

- Advanced BYOK is hidden by default.
- BYOK may override the managed provider only after the user explicitly enables and configures it.
- Beginner-mode UI must not make BYOK look required.

Managed NVIDIA defaults:

```env
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-ai/deepseek-v4-pro
NVIDIA_FALLBACK_MODEL=z-ai/glm-5.1
```

Required secret:

```env
NVIDIA_API_KEY=
```

Rules:

- Provider secrets stay backend-only.
- Do not commit `.env`.
- Do not log API keys.
- Do not return API keys to the frontend.
- Frontend can display whether AI is available, but not secret configuration details.
- BYOK, if added, is advanced-only and hidden by default.
- All provider failures must resolve to clean AI unavailable responses in the frontend.

## 9. Local Codex Bridge Rules

The local Codex bridge is optional only.

It is for local trusted installs only. It is never required for hosted/student mode and must never be shown to beginner users as a setup step.

It is enabled only when:

```env
LOCAL_CODEX_ENABLED=true
```

Allowed uses:

```text
explain
hint
evaluate
```

The bridge must not be used for:

- Generating full artifacts in v1.
- Editing project files.
- Running arbitrary student commands.
- Running shell commands chosen by the model.
- Accessing secrets outside its normal authenticated runtime.
- Replacing the backend code runner.

Execution constraints:

- Must run non-interactive, read-only, or otherwise constrained.
- Must return structured JSON or a shape that the backend normalizes into the AI endpoint response contracts.
- Must have timeout and output limits.
- Must not block artifact use if unavailable.

Fallback rules:

- If Codex is disabled, do not call it.
- If Codex is enabled but unavailable, fail gracefully.
- The managed backend provider remains the preferred beginner-mode provider.
- A Codex failure must not surface as a confusing terminal error in the frontend.

## 10. What v1 Is NOT Building

v1 is intentionally limited.

Do not build these in v1:

- AI-generated full artifacts.
- opencode integration.
- Multi-tenant auth.
- Teacher/admin dashboard.
- ML/DS/AI pack.
- Backend/frontend packs.
- Mobile app.
- E2B hosted sandbox.
- tldraw integration.
- LangChain integration.
- Judge0 integration.
- WebContainers integration.
- Sandpack integration.
- Hosted classroom management.
- Public user accounts.
- Billing.
- Artifact marketplace.

These exclusions are product constraints, not missing TODOs.

## 11. Phase Gates

Phase 0 output is this spec.

Phase 1 cannot start until this spec is reviewed and accepted by the architect-reviewer/product owner.

Each later phase must be reviewed before the next phase begins.

Phase order:

```text
Phase 0 — Spec
Phase 1 — Backend + Queue Artifact
Phase 2 — Frontend Artifact Shell
Phase 3 — Canvas + Explore
Phase 4 — Practice Runtime
Phase 5 — AI Review
Phase 6 — Stack and HashMap
```

No phase starts early.

Examples:

- Do not add Stack while Queue is broken.
- Do not add Java if Python flow is broken.
- Do not add Codex bridge if managed provider handling is broken.
- Do not polish provider settings before beginner mode works.
- Do not modify old `canvas/` unless explicitly instructed.

Every Hermes implementation output must include:

```text
Files changed:
- ...

What works:
- ...

Tests run:
- ...

Known caveats:
- ...

Blockers/questions:
- ...
```

Review checklist:

```text
1. Did it follow this spec?
2. Did it add scope?
3. Is the code readable?
4. Are secrets safe?
5. Are errors honest?
6. Does the UX make sense for beginner/sister mode?
7. Does build/test pass?
8. Can another human maintain this?
```

If a phase fails review, fix that phase before starting the next one.

## 12. Phase 0.5 Amendment: Local Prompt-Authored Cached Artifacts

This amendment supersedes any earlier assumption that every learning artifact must be fully hand-authored as static JSON or handcoded React.

Refract remains artifact-first, local-first, beginner-first, and visual-first. The product is not a hosted SaaS by default. In the current product shape, a user clones the repo and runs it locally. If Refract gets traction later, cloud hosting can be added as a separate deployment mode, but the runtime must not require hosting.

### 12.1 Product correction

The primary Refract content source is a standardized prompt library, not per-topic handcoded UI.

```text
profiles/        learner archetypes and style preferences
topics/          topic prompt files and lens connections
references/      manually curated article/video/problem links
generated/       cached generated artifacts and audio assets
backend/         local API, generation, validation, runner, cache
frontend/        artifact viewer and fixed visual primitives
canvas/          old reference/dev tool only
```

Topic prompt files describe what to teach. Generated artifacts are durable outputs produced from those prompts and cached locally. Opening a topic must not regenerate the artifact automatically.

### 12.2 Learner profiles

Profiles are archetypes, not one-off per-user prompt snowflakes. Caching only works if many users can share the same generated artifact for the same profile archetype.

Initial profile archetypes:

```text
profiles/sandeep-go-backend.md
profiles/sister-python-ai.md
```

`sandeep-go-backend`:

- Learns Go, DSA, backend engineering, and system design.
- Wants visual, audio, and hands-on explanations.
- Examples should use backend services, workers, APIs, queues, storage, and production tradeoffs.

`sister-python-ai`:

- Learns Python, DSA, system design, ML/DS/AI.
- Beginner mode, no terminal assumptions, no provider jargon.
- Examples should use simple Python, data/AI intuition, and visual explanation first.

Do not generate a separate artifact variant for every individual user unless explicitly approved later. Use profile archetypes.

### 12.3 Topic prompt files

Topic prompt files are Markdown with frontmatter. They are prompts plus curriculum metadata, not final rendered artifacts.

Example:

```text
topics/dsa/queue.md
topics/system-design/retry-queues.md
topics/backend/go/worker-queues.md
topics/ml-ai/embeddings.md
topics/game-theory/queue-congestion.md
```

Each topic file must define:

```yaml
topicId: dsa.queue
title: Queue
allowedVisualKinds: [queue]
primaryLens: dsa
connectedLenses:
  system_design: system-design.retry-queues
  backend_go: backend.go.worker-queues
  backend_python: backend.python.async-queues
  game_theory: game-theory.queue-congestion
profiles:
  - sandeep-go-backend
  - sister-python-ai
references:
  - title: "..."
    url: "..."
    whyRead: "..."
next:
  - dsa.stack
```

The Markdown body gives teaching intent, common misconceptions, story framing, practice intent, and model constraints.

### 12.4 Generate once, cache until manually regenerated

Generation flow:

```text
profile + topic requested
→ backend loads profile Markdown
→ backend loads topic Markdown
→ backend loads connected lens metadata and references
→ backend applies the global artifact output contract
→ model returns JSON only
→ backend validates JSON
→ backend validates visual kind against topic allowedVisualKinds
→ backend caches the generated artifact under generated/
→ frontend renders the cached artifact
```

Open flow after cache exists:

```text
profile + topic requested
→ backend returns cached generated artifact
→ no model call
```

Regeneration is manual/admin-controlled only. No page load should silently rewrite a cached artifact.

Cache path shape:

```text
generated/artifacts/<profileId>/<topicId>/artifact.json
generated/audio/<profileId>/<topicId>/story.mp3
generated/audio/<profileId>/<topicId>/review.mp3
```

Generated runtime data must be ignored by git unless explicitly promoted into curated examples.

### 12.5 Fixed visual primitives, generated content

The model must not generate arbitrary rendering code for normal artifacts.

The model may generate content and structured visual configuration. The frontend owns rendering primitives.

Correct:

```json
{
  "visual": {
    "kind": "queue",
    "title": "Payment retry queue",
    "items": ["pay_101", "pay_102"],
    "controls": [
      { "type": "enqueue", "label": "Add failed payment" },
      { "type": "dequeue", "label": "Retry next payment" },
      { "type": "slider", "param": "workerSpeed", "label": "Worker speed", "min": 1, "max": 3 }
    ],
    "animationScript": [
      { "type": "queue.enqueue", "value": "pay_101", "caption": "A failed payment joins the back." }
    ]
  }
}
```

Wrong by default:

```json
{
  "html": "<script>model-written interaction code...</script>"
}
```

Reason:

- Fixed primitives give consistent visual quality.
- Fixed primitives reduce XSS and arbitrary-code risk.
- Fixed primitives make weaker fallback models usable.
- Generated content stays reviewable and cacheable.

The first fixed primitive is `queue`. Later primitives may include `stack`, `hashmap`, `graph`, `timeline`, `pipeline`, `vector-space`, and `matrix`, but a topic may only request kinds listed in its own `allowedVisualKinds`.

If a topic needs a visual kind that does not exist yet, generation must fall back to a text-plus-static-diagram artifact rather than inventing executable code.

### 12.6 Generated artifact JSON contract

The model must return exactly one JSON object and no prose outside JSON.

Required generated artifact shape:

```json
{
  "schemaVersion": 1,
  "artifactVersion": 1,
  "profileId": "sister-python-ai",
  "topicId": "dsa.queue",
  "title": "Payment Retry Queue",
  "summary": "...",
  "lenses": {
    "dsa": { "angle": "...", "takeaway": "..." },
    "system_design": { "angle": "...", "takeaway": "..." },
    "game_theory": { "angle": "...", "takeaway": "..." },
    "language": { "name": "python", "angle": "..." }
  },
  "story": {
    "markdown": "...",
    "audioScript": "..."
  },
  "explore": {
    "visual": {
      "kind": "queue",
      "state": {},
      "controls": [],
      "animationScript": []
    }
  },
  "practice": {
    "language": "python",
    "starterCode": "...",
    "tests": "...",
    "hints": []
  },
  "review": {
    "rubric": []
  },
  "references": [
    { "title": "...", "url": "...", "whyRead": "..." }
  ],
  "next": ["dsa.stack"]
}
```

Backend validation must check:

- Valid JSON.
- Required keys exist.
- Required values have the correct type.
- `schemaVersion === 1`.
- `profileId` matches the requested profile.
- `topicId` matches the requested topic.
- `explore.visual.kind` is in the topic's `allowedVisualKinds`.
- No raw executable HTML/JS fields are present unless a future sandboxed mode explicitly allows them.
- Practice language is allowed by the selected profile/topic.
- Reference URLs are strings and never treated as trusted code.

### 12.7 Validation failure behavior

Never show a broken generated artifact to a beginner.

If generation fails validation:

1. Retry once with the same topic/profile plus the validation error summary.
2. If the retry fails, save a failure record and return a clean fallback artifact:

```json
{
  "status": "generation_failed",
  "message": "Refract could not generate a safe interactive artifact yet. Showing a text-first explanation instead.",
  "fallback": {
    "storyMarkdown": "...",
    "visualKind": "static-diagram"
  }
}
```

Frontend behavior:

- Show the fallback clearly.
- Do not crash.
- Do not show provider/model jargon.
- Offer an admin/developer regenerate action only outside beginner mode.

### 12.8 Audio contract

Every generated artifact must include `story.audioScript`.

Audio should be generated once and cached when a TTS provider is configured. For local-first development, the app may also use browser speech synthesis as a fallback from `audioScript`.

Audio generation flow:

```text
artifact JSON validated
→ backend checks TTS provider configuration
→ if configured, generate audio once
→ save audio under generated/audio/<profileId>/<topicId>/
→ frontend plays cached audio
→ if unavailable, frontend can show/read audioScript text
```

NVIDIA or another configured provider may be used when available through backend environment variables. No TTS provider key may be exposed to the frontend.

### 12.9 Local-first rule

Current deployment mode is local clone only.

```text
git clone
npm install backend
npm install frontend
npm start backend
npm run dev frontend
```

No multi-tenant auth, admin SaaS, college dashboards, billing, or hosted classroom system belongs in the local-first runtime unless explicitly re-scoped later.

### 12.10 Strong-artifact quality bar

Generated artifacts must be:

- Visual-first.
- Interactive when the selected visual primitive supports interaction.
- Audio-scripted.
- Hands-on with practice code and tests.
- Connected across lenses, not isolated facts.
- Cached and reviewable.
- Safe to render.

Weak artifacts are rejected. Examples of weak artifacts:

- Wall-of-text only.
- Static generic diagram when an allowed interactive primitive exists.
- Provider jargon in beginner mode.
- Broken JSON.
- Raw model-written JavaScript.
- Missing references.
- Missing practice path.

### 12.11 Immediate implementation direction

Do not continue building one-off hardcoded Queue UI as the main product path.

Next implementation should establish the local prompt-authored artifact pipeline:

1. Add `profiles/`, `topics/`, `references/`, and `generated/` layout.
2. Add one profile for Sandeep and one for sister mode.
3. Add one topic prompt for `dsa.queue` with `allowedVisualKinds: [queue]`.
4. Add backend loader for profile/topic Markdown.
5. Add strict generated artifact schema validation.
6. Add generate-once cache behavior.
7. Add a fixed queue visual primitive that renders generated `kind: "queue"` specs.

This keeps the content prompt-authored while keeping rendering quality strong and safe.
