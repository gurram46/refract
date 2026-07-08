# Refract Local Artifact Workbench Blueprint

Status: base development file.  
Audience: Hermes/build agents, reviewer agents, and product owner.  
Purpose: define exactly what Refract is now, how the UI should feel/work, how the backend works, how local runtimes connect, how models are used, and what must not be rebuilt from the old canvas app.

## 1. Product Definition

Refract is a local-first AI artifact learning workbench for visual, audio, and hands-on learners.

It is not:

- a dashboard,
- a ChatGPT clone,
- a normal lesson app,
- a hosted classroom SaaS right now,
- the old `canvas/` app,
- a place where the model writes random UI code per topic.

It is:

- artifact-first,
- profile-aware,
- topic-prompt-authored,
- generated once and cached,
- rendered by trusted fixed visual primitives,
- backed by local code runners,
- supported by an artifact-aware tutor chat,
- built for local clone usage first.

The learner should feel:

```text
I open one concept.
I see it move.
I hear/see the story.
I interact with it.
I write code.
I run tests.
I ask the tutor why things happened.
I get review and next steps.
```

The learner should not feel:

```text
I am configuring models.
I am choosing providers.
I need to understand terminals.
I am navigating a dashboard.
I am reading a wall of text.
I am debugging a broken generated web app.
```

## 2. Primary Users and Profiles

Refract is initially for two learner archetypes.

### 2.1 `sandeep-go-backend`

Learns:

- Go,
- DSA,
- backend engineering,
- system design.

Needs:

- visual-first explanation,
- backend/service examples,
- practical Go/backend framing,
- system-design tradeoffs,
- game-theory/incentive framing,
- hands-on practice.

Example queue framing:

```text
A retry queue feeding Go workers with backpressure and fairness.
```

### 2.2 `sister-python-ai`

Learns:

- Python,
- DSA,
- system design,
- ML/DS/AI basics.

Needs:

- beginner-first language,
- no provider/API/terminal jargon,
- visual and audio narration,
- small Python examples,
- gentle hands-on practice,
- connections to AI/data concepts when relevant.

Example queue framing:

```text
A line of failed payments or AI tasks waiting their turn.
```

### 2.3 Profile rule

Profiles are archetypes, not per-user random prompt variants.

Do:

```text
profileId = sister-python-ai
profileId = sandeep-go-backend
```

Do not do by default:

```text
profileId = every individual user with a totally unique prompt
```

Caching works because the same topic/profile pair can reuse the same generated artifact.

## 3. Local-First Deployment Rule

Current Refract is local clone only.

Expected run shape:

```bash
git clone <repo>
cd refract/backend
npm install
npm start
```

```bash
cd refract/frontend
npm install
npm run dev
```

No hosting is required for the default product.

Cloud hosting can come later only if explicitly re-scoped. Do not build these now:

- tenant auth,
- teacher login,
- student login,
- admin login,
- college dashboard,
- billing,
- institution onboarding,
- hosted classroom analytics.

Those are not current local-first runtime requirements.

## 4. Repo Structure

Active product shape:

```text
profiles/       learner archetype prompts and style rules

topics/         topic prompt files and lens connections
references/     verified article/video/problem references
generated/      ignored local cache for generated artifact JSON and audio
packs/          seed artifact data during transition only
backend/        local API, provider routing, generation, validation, runners, cache
frontend/       artifact workbench UI and fixed visual primitives
docs/           product/spec/engineering contracts
```

Removed/deprecated:

```text
canvas/         deleted from active product path
```

The old `canvas/` app was removed because it encouraged the wrong product:

- paste-a-visual dev tool,
- hardcoded practice UI,
- old runner demo assumptions,
- not profile/topic prompt-authored,
- not generated-once/cached,
- not strong enough for the new artifact system.

Useful old ideas may be recovered from git history and ported intentionally. Do not restore the `canvas/` app.

## 5. Content Model

Refract separates source prompts from generated artifacts.

### 5.1 Source prompts

Source prompts are human-authored Markdown files.

```text
profiles/sandeep-go-backend.md
profiles/sister-python-ai.md

topics/dsa/queue.md
topics/system-design/retry-queues.md
topics/backend/go/worker-queues.md
topics/backend/python/async-queues.md
topics/ml-ai/embeddings.md
topics/game-theory/queue-congestion.md

references/dsa/queue.md
references/system-design/retry-queues.md
```

A topic file is not the final artifact. It is the instruction source for generating the artifact.

### 5.2 Generated artifacts

Generated artifacts are cached JSON outputs.

```text
generated/artifacts/<profileId>/<topicId>/artifact.json
generated/audio/<profileId>/<topicId>/story.mp3
generated/audio/<profileId>/<topicId>/review.mp3
```

`generated/` is ignored by git by default.

### 5.3 Generate-once rule

Opening a topic must not call the model if a valid cached artifact already exists.

Flow:

```text
open topic
→ check generated/artifacts/<profile>/<topic>/artifact.json
→ if valid, return cached artifact
→ if missing and generation requested, call model
→ validate
→ cache
→ return
```

Regeneration is manual/admin/developer action only.

## 6. Topic Prompt File Contract

Topic files are Markdown with frontmatter.

Example:

```yaml
---
topicId: dsa.queue
title: Queue
primaryLens: dsa
allowedVisualKinds: [queue]
profiles:
  - sandeep-go-backend
  - sister-python-ai
connectedLenses:
  system_design: system-design.retry-queues
  backend_go: backend.go.worker-queues
  backend_python: backend.python.async-queues
  game_theory: game-theory.queue-congestion
references:
  - title: Queue Data Structure
    url: https://example.com/queue
    whyRead: Core FIFO explanation.
next:
  - dsa.stack
---
```

Body should include:

- teaching goal,
- story premise,
- what the learner should see visually,
- common misconceptions,
- required interaction ideas,
- practice goal,
- language/profile-specific notes,
- what not to say,
- links to connected lens files.

Important rule:

```text
allowedVisualKinds controls what renderer the model may request.
```

The model does not freely invent visual kinds.

## 7. Artifact JSON Contract

The model must output exactly one JSON object. No prose before or after.

Required shape:

```json
{
  "schemaVersion": 1,
  "artifactVersion": 1,
  "profileId": "sister-python-ai",
  "topicId": "dsa.queue",
  "title": "Payment Retry Queue",
  "summary": "A queue keeps retry work fair by serving the first failed payment first.",
  "lenses": {
    "dsa": { "angle": "FIFO enqueue/dequeue", "takeaway": "First in, first out." },
    "system_design": { "angle": "Retry pipeline and backpressure", "takeaway": "Queues protect workers from bursts." },
    "game_theory": { "angle": "Fairness under congestion", "takeaway": "FIFO stops late arrivals from jumping ahead." },
    "language": { "name": "python", "angle": "Implement the queue with a list or deque." }
  },
  "story": {
    "markdown": "...",
    "audioScript": "..."
  },
  "explore": {
    "visual": {
      "kind": "queue",
      "state": {
        "items": ["pay_101", "pay_102"],
        "workerSpeed": 1
      },
      "controls": [
        { "type": "enqueue", "label": "Add failed payment" },
        { "type": "dequeue", "label": "Retry next payment" },
        { "type": "slider", "param": "workerSpeed", "label": "Worker speed", "min": 1, "max": 3 }
      ],
      "animationScript": [
        { "type": "queue.enqueue", "value": "pay_101", "caption": "A failed payment joins the back." }
      ]
    }
  },
  "practice": {
    "language": "python",
    "starterCode": "...",
    "tests": "...",
    "hints": []
  },
  "review": {
    "rubric": [
      { "dimension": "logic", "weight": 40 },
      { "dimension": "edge_cases", "weight": 30 },
      { "dimension": "trace_usage", "weight": 20 },
      { "dimension": "clarity", "weight": 10 }
    ]
  },
  "references": [
    { "title": "...", "url": "...", "whyRead": "..." }
  ],
  "next": ["dsa.stack"]
}
```

## 8. Fixed Visual Primitive Rule

The model generates structured specs. The frontend renders them.

Good:

```json
{
  "kind": "queue",
  "state": { "items": ["A", "B"] },
  "controls": [{ "type": "enqueue" }, { "type": "dequeue" }]
}
```

Bad:

```json
{
  "html": "<script>function randomModelCode(){...}</script>"
}
```

Why fixed primitives:

- consistent visual quality,
- deterministic interaction,
- safer rendering,
- fewer model failures,
- works across NVIDIA/DeepSeek/GLM/Ollama fallback quality differences,
- easier to test.

Initial primitives to build:

```text
queue
stack
hashmap
graph
timeline
pipeline
vector-space
matrix
```

Do not implement all at once. But the contract supports them.

If a generated artifact requests a visual kind not implemented or not allowed by the topic, validation fails and the backend returns a safe fallback.

## 9. UI Philosophy

The old canvas UI was wrong. Do not reproduce it.

The UI must feel like:

```text
A focused learning artifact workspace.
```

Not:

```text
A dev demo.
A code playground.
A provider dashboard.
A paste box.
A 3-column cluttered practice page.
A chat app with an artifact stuck beside it.
```

### 9.1 UI hierarchy

Main screen:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: Refract | Profile | Topic path | status              │
├───────────────────────────────────────────────┬──────────────┤
│ Artifact Workspace                            │ Tutor Panel  │
│ Story / Explore / Practice / Review tabs      │ Chat + help  │
│                                               │              │
└───────────────────────────────────────────────┴──────────────┘
```

The artifact workspace is the main event.

The tutor panel is secondary and calm.

### 9.2 Header

Header should show:

- Refract brand,
- active profile,
- active topic,
- local status,
- AI availability as plain language.

Allowed status copy:

```text
Local backend ready
Tutor ready
Tutor unavailable
Generated artifact cached
```

Forbidden beginner copy:

```text
NVIDIA provider selected
DeepSeek V4 Pro active
BYOK
Base URL
API key missing
```

Developer details can appear in an Advanced panel later.

### 9.3 Profile and topic selection

For now, simple local selectors:

```text
Profile: Sandeep — Go Backend
Profile: Sister — Python AI
Topic: Queue
```

No account system.

No login.

No tenant selector.

### 9.4 Artifact container

Each artifact has four tabs:

```text
Story
Explore
Practice
Review
```

Tabs are not separate pages. They are phases of one workspace.

## 10. Story Tab UI

Goal: explain the concept visually and emotionally before code.

Must show:

- title,
- one-line summary,
- story markdown,
- audio controls,
- lens cards,
- concept visual preview,
- references,
- next action button.

Layout:

```text
┌─────────────────────────────┬────────────────────────────┐
│ Story text + audio          │ Concept visual             │
│ Lens cards                  │ Animated preview           │
│ References                  │                            │
│ [Try it]                    │                            │
└─────────────────────────────┴────────────────────────────┘
```

Audio controls:

```text
[Play story] [Pause] [Replay]
```

If cached audio exists, play it.

If no audio file exists, use browser speech synthesis or show the audio script text.

No provider setup.

## 11. Explore Tab UI

Goal: learner manipulates the concept before coding.

Must show:

- fixed visual primitive,
- controls from generated spec,
- current state,
- clear cause/effect animation,
- recent event log or simplified history,
- “Start coding” action.

For Queue:

```text
┌──────────────────────────────────────────────┐
│ Queue Visual                                 │
│                                              │
│ [front] pay_101 → pay_102 → pay_103 [back]   │
│                                              │
│ Animation caption: pay_101 leaves first      │
├──────────────────────────────────────────────┤
│ [Add failed payment] [Retry next payment]    │
│ Worker speed: 1 — 2 — 3                      │
│ [Reset]                                      │
└──────────────────────────────────────────────┘
```

Event emitted by UI:

```json
{ "type": "student.enqueue", "value": "pay_104" }
{ "type": "student.dequeue" }
{ "type": "student.explore", "param": "workerSpeed", "value": 2 }
```

The event log is used for tutor context.

Beginner UI can show a small friendly history:

```text
You added pay_104.
You retried pay_101.
You made the worker faster.
```

Developer debug can show raw JSON only behind Advanced.

## 12. Practice Tab UI

Goal: learner writes code, runs tests, and sees trace-driven feedback.

Not old canvas practice mode.

Desktop layout:

```text
┌───────────────────────────────┬──────────────────────────────┐
│ Code editor                   │ Trace visual                 │
│                               │                              │
│ Starter code                  │ Queue animation from events   │
│                               │                              │
│ [Run Tests] [Hint]            │ [Play] [Step] [Reset]         │
├───────────────────────────────┴──────────────────────────────┤
│ Test output / failure explanation                             │
└───────────────────────────────────────────────────────────────┘
```

Must include:

- selected language from profile/topic,
- starter code,
- run tests button,
- test result panel,
- trace events visualized by fixed primitive,
- hint button routed through tutor.

Must not include:

- provider setup,
- fake test success,
- arbitrary shell access,
- raw scary stack traces as the main beginner message.

Code execution happens in backend only.

## 13. Review Tab UI

Goal: convert attempt into feedback and next steps.

Must show:

- latest run status,
- rubric,
- AI feedback if available,
- what to fix next,
- “Try again” button,
- next topic link.

If AI unavailable:

```text
Tutor review is unavailable right now, but your test results are still here.
```

Do not say:

```text
NVIDIA_API_KEY missing.
```

That belongs in backend logs or Advanced developer panel.

## 14. Tutor Chat UI

Refract needs chat, but it is not a general chat app.

It is an artifact-aware tutor panel.

Desktop:

```text
Right side panel, narrow, calm, always secondary.
```

Mobile:

```text
Bottom drawer or collapsible panel.
```

Tutor panel contains:

- message list,
- quick action buttons,
- text input,
- optional audio playback for answers.

Quick actions:

```text
Explain this
Give me a hint
Why did this happen?
Check my understanding
Review my code
What next?
```

Free input placeholder:

```text
Ask about this artifact...
```

Tutor request must include runtime context:

```json
{
  "profileId": "sister-python-ai",
  "topicId": "dsa.queue",
  "activeTab": "explore",
  "message": "Why did pay_101 leave first?",
  "context": {
    "visualState": {
      "kind": "queue",
      "items": ["pay_102"],
      "workerSpeed": 2
    },
    "recentEvents": [
      { "type": "student.enqueue", "value": "pay_101" },
      { "type": "student.dequeue", "value": "pay_101" }
    ],
    "latestRunResult": null,
    "traceEvents": []
  }
}
```

Tutor response:

```json
{
  "status": "ok",
  "message": "pay_101 left first because a queue follows FIFO: first in, first out...",
  "suggestedActions": ["Add another payment", "Go to Practice"]
}
```

Tutor must never:

- ask for API keys,
- mention provider/model names in beginner mode,
- claim tests passed if no tests ran,
- claim code was reviewed if no code/run result was provided,
- edit files,
- run arbitrary commands,
- generate arbitrary UI code.

## 15. Backend Responsibilities

Backend owns:

- local API server,
- provider secrets,
- profile/topic/reference loading,
- artifact generation,
- artifact validation,
- generated artifact cache,
- generated audio cache,
- local code execution,
- trace parsing,
- progress storage,
- tutor prompt construction,
- AI response validation.

Frontend owns:

- rendering,
- local UI state,
- interaction events,
- sending summarized context,
- playing audio,
- showing friendly errors.

## 16. Backend API Plan

Existing baseline routes:

```text
GET  /health
GET  /artifacts/:id
POST /run
POST /ai/stream/explain
POST /ai/stream/hint
POST /ai/stream/evaluate
GET  /progress/:studentId
POST /progress/:studentId
```

New local artifact runtime routes:

```text
GET  /profiles
GET  /profiles/:profileId
GET  /topics
GET  /topics/:topicId
GET  /artifact-runtime/:profileId/:topicId
POST /artifact-runtime/:profileId/:topicId/generate
POST /artifact-runtime/:profileId/:topicId/regenerate
POST /ai/tutor
POST /audio/:profileId/:topicId/generate
GET  /audio/:profileId/:topicId/:name
```

### 16.1 `GET /artifact-runtime/:profileId/:topicId`

Returns cached generated artifact if available and valid.

If missing:

```json
{
  "status": "not_generated",
  "message": "This artifact has not been generated yet."
}
```

Do not auto-call the model unless the route is explicitly a generation route.

### 16.2 `POST /artifact-runtime/:profileId/:topicId/generate`

Generates only if cache is missing.

### 16.3 `POST /artifact-runtime/:profileId/:topicId/regenerate`

Regenerates deliberately. Should be hidden from beginner mode by default.

### 16.4 `POST /ai/tutor`

Artifact-aware tutor chat.

Must validate:

- profile exists,
- topic exists,
- message is string and within length limit,
- context shape is safe,
- no secrets in payload.

## 17. Model Provider Plan

Users interact with Refract, not with models.

Frontend never calls NVIDIA directly.

```text
frontend → backend → provider
```

Managed provider env:

```env
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-ai/deepseek-v4-pro
NVIDIA_FALLBACK_MODEL=z-ai/glm-5.1
```

Provider usage:

- artifact generation,
- tutor answers,
- hint/review,
- optional audio/TTS if configured through backend.

Beginner UI states:

```text
Tutor ready
Tutor unavailable
Artifact cached
Generating artifact
```

Forbidden beginner UI states:

```text
NVIDIA key missing
DeepSeek selected
GLM fallback active
Base URL
BYOK
```

Those details can exist in logs or Advanced developer status later.

## 18. AI Prompting and Validation

All AI outputs that affect UI must be schema validated.

Do not trust model JSON blindly.

Generation prompt layers:

```text
system: global Refract artifact contract
profile: learner archetype
primary topic: topic Markdown
connected lenses: linked topic summaries
references: curated links
output: strict JSON only
```

If model output fails:

1. Parse error or schema error.
2. Retry once with validation error summary.
3. If still invalid, return fallback artifact.
4. Save failure record for developer review.

No broken artifact reaches beginner UI.

## 19. Audio Plan

Every artifact has `story.audioScript`.

Audio modes:

### Mode A: Cached provider audio

```text
validated artifact
→ backend calls configured TTS provider
→ saves MP3 under generated/audio/<profile>/<topic>/
→ frontend plays audio file
```

### Mode B: Browser speech fallback

If backend audio is not configured:

```text
frontend uses browser speech synthesis from audioScript
```

### Mode C: Text only fallback

If speech is not available:

```text
show audioScript as readable narration
```

No TTS key goes to frontend.

## 20. Local Code Runner Plan

Student code execution happens on the local backend.

Frontend sends:

```json
{
  "profileId": "sister-python-ai",
  "topicId": "dsa.queue",
  "language": "python",
  "code": "..."
}
```

Backend:

- creates temp workspace,
- injects trace helper,
- injects assert helper,
- loads tests from generated artifact/topic, not frontend,
- runs with timeout,
- captures stdout/stderr,
- parses trace events,
- cleans temp workspace,
- returns structured result.

Local runtime detection:

```text
python --version
node --version
go version
javac -version
java -version
```

Only required runtime for a topic/profile should block that practice path.

Example:

- Sister Python Queue requires Python.
- Sandeep Go Backend topic may require Go when Go practice is implemented.
- Java is not required unless topic/profile asks for Java.

No arbitrary shell from frontend.

## 21. Trace and Runtime Context

Trace events connect code execution to visuals and tutor review.

Python helper example:

```python
event("queue.enqueue", value=payment_id, label=payment_id)
```

Trace output protocol:

```text
REFRACT_TRACE: {"type":"queue.enqueue","value":"pay_101","label":"pay_101"}
```

Runtime context summary is the bridge to tutor:

```json
{
  "activeTab": "practice",
  "visualState": {},
  "recentExploreEvents": [],
  "latestRunResult": {
    "success": false,
    "summary": "dequeue returns the wrong item"
  },
  "traceEvents": []
}
```

Tutor receives summaries, not huge raw logs.

## 22. Frontend Component Plan

Target structure:

```text
frontend/src/
  App.jsx
  lib/
    api.js
    artifactRuntimeApi.js
    tutorApi.js
  components/
    AppHeader.jsx
    ArtifactContainer.jsx
    ProfileSelector.jsx
    TopicSelector.jsx
    tutor/
      TutorPanel.jsx
      TutorMessageList.jsx
      TutorInput.jsx
      QuickActions.jsx
    tabs/
      StoryTab.jsx
      ExploreTab.jsx
      PracticeTab.jsx
      ReviewTab.jsx
    visuals/
      QueueVisual.jsx
      StackVisual.jsx
      HashMapVisual.jsx
      StaticDiagram.jsx
    runtime/
      visualRegistry.js
      summarizeRuntimeContext.js
```

`visualRegistry.js` maps fixed kinds to components:

```js
export const visualRegistry = {
  queue: QueueVisual,
  staticDiagram: StaticDiagram
};
```

If `kind` missing or unsupported, show safe fallback.

## 23. UI Style Requirements

Dark theme is okay, but it must be calm and product-like.

Do:

- clear hierarchy,
- readable text,
- strong visual area,
- small tutor panel,
- accessible controls,
- obvious next action,
- smooth animations with meaning.

Do not:

- make it neon/dev-tool style,
- overuse orange/brown palette,
- use giant border radii everywhere,
- use negative letter spacing,
- cram three dashboards into one screen,
- show logs/raw JSON to beginners,
- make chat dominate the artifact.

Visuals should feel educational, not decorative.

Animations must explain state changes:

```text
item enters queue
front item leaves queue
worker speed changes drain rate
backpressure grows queue
```

## 24. Error Handling UX

Beginner-facing errors:

```text
This artifact is not ready yet.
Tutor is unavailable right now, but you can keep learning.
Practice needs Python installed on this computer.
The generated artifact did not pass safety checks, so Refract is showing a text fallback.
```

Avoid:

```text
NVIDIA_API_KEY missing
JSON schema validation failed at explore.visual.kind
spawn python ENOENT
```

Developer details can be behind Advanced/debug.

## 25. Security and Safety

- No provider keys in frontend.
- No raw model-written JS rendered as trusted code.
- No arbitrary shell from frontend.
- Code runner has timeout and output caps.
- Temp workspaces cleaned.
- Generated artifacts validated before cache/use.
- References are untrusted strings.
- Audio generated backend-side when provider is used.
- `generated/` and runtime data ignored by git.

## 26. What Not To Build Now

Do not build now:

- hosted SaaS,
- login/auth,
- college admin system,
- billing,
- tenant isolation,
- public marketplace,
- old canvas resurrection,
- Sandpack/WebContainers,
- arbitrary AI-generated app rendering,
- opencode integration,
- teacher dashboards.

These may be future products. They are not the local artifact workbench.

## 27. Immediate Build Order

Next implementation should follow this order:

1. Create `profiles/` with:
   - `sandeep-go-backend.md`
   - `sister-python-ai.md`
2. Create `topics/dsa/queue.md` with `allowedVisualKinds: [queue]`.
3. Create `references/dsa/queue.md` with manually verified links.
4. Add backend Markdown/frontmatter loader.
5. Add generated artifact schema validator.
6. Add cache read/write under `generated/`.
7. Add generation route using NVIDIA backend provider.
8. Add fixed `QueueVisual` primitive.
9. Add artifact-aware tutor panel.
10. Add audio script playback and optional cached TTS.
11. Add practice runner integration against generated artifact tests.
12. Add review using validated AI output.

Do not skip directly to many topics. One strong Queue artifact is the quality bar.

## 28. Definition of Done for the First Strong Artifact

For `sister-python-ai` + `dsa.queue`:

- Profile loads.
- Topic prompt loads.
- Generated artifact JSON validates.
- Artifact is cached.
- Story shows beginner explanation.
- Story audio can play or fallback to script/browser speech.
- Queue visual is animated and interactive.
- Explore events are recorded.
- Tutor can answer based on current visual state.
- Python starter code appears.
- Python tests run locally.
- Trace events animate the queue.
- Review gives validated structured feedback.
- No provider jargon appears in beginner UI.

For `sandeep-go-backend` + `dsa.queue`:

- Same topic can generate a backend/Go/system-design-flavored artifact variant.
- The visual primitive stays the same quality.
- The framing changes to backend workers/retry pipeline/backpressure.

## 29. Development Reporting Format

Every implementation response must include:

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

If verification is ad-hoc, say so directly.

If tests fail, say exactly which command failed and why.

## 30. North Star

Refract should feel like a living textbook where every concept becomes a visual, interactive, audible, hands-on artifact.

The model authors the lesson data.

Refract owns the runtime quality.

The learner never fights provider setup, broken generated UI, or dashboard clutter.
