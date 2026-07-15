# Refract product UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Replace the fixed Queue prototype with the approved Profile Builder, connected Game Field, and interactive Artifact Canvas.

**Architecture:** The frontend boots from `/options`, `/profiles`, and `/topics`, then derives one of three product surfaces from state. It renders generated artifacts as validated data through fixed React primitives and keeps chat secondary to the canvas.

**Tech stack:** React 19, Vite 7, plain CSS, browser fetch, Node built-in tests for API/state helpers

## Global constraints

- The artifact canvas is the primary product
- DSA, system design, and game theory are permanent core domains
- Profiles are user-created; no Sandeep or Sister defaults
- Paired domains are language, backend, frontend, ML, AI, and data science
- Frontend never calls NVIDIA directly or displays keys, models, providers, schema paths, or stack traces
- Generated content is data; frontend renders fixed primitives only
- Chat receives artifact, canvas, code, run, trace, and recent interaction context
- Code visuals replay actual backend trace events, never model-guessed events
- Desktop and mobile layouts must work
- Keep components focused, readable, reusable, and free of unnecessary memoization
- Do not commit unless explicitly requested

### Task 1: API client and product state

**Owner:** DeepSeek V4 Pro

**Files:**
- Replace: `frontend/src/lib/api.js`
- Create: `frontend/src/lib/api.test.js`
- Create: `frontend/src/lib/productState.js`
- Create: `frontend/src/lib/productState.test.js`
- Modify: `frontend/package.json`

- [ ] Add typed-by-shape request helpers for options, profiles, topics, cached artifacts, generation, sessions, tutor requests, and code runs.
- [ ] Normalize safe errors without provider jargon.
- [ ] Add pure state helpers for selecting the active profile/topic and building tutor context.
- [ ] Test URL, method, body, safe errors, and context bounds using injected fetch.
- [ ] Add `npm test` using `node --test src/lib/*.test.js`.

### Task 2: Profile Builder and connected Game Field

**Owner:** DeepSeek V4 Flash

**Files:**
- Replace: `frontend/src/App.jsx`
- Replace: `frontend/src/components/AppHeader.jsx`
- Create: `frontend/src/components/ProfileBuilder.jsx`
- Create: `frontend/src/components/GameField.jsx`
- Create: `frontend/src/components/StatusPanel.jsx`

- [ ] Boot options, profiles, and topics in parallel.
- [ ] Start on Profile Builder when no profile exists.
- [ ] Save language, paired domains, level, goal, and selected topic through `/profiles`.
- [ ] Render permanent core domains separately from selected pairings.
- [ ] Render graph nodes and connections from `/topics`, not hardcoded learner pages.
- [ ] Open a selected topic through the artifact-runtime API.
- [ ] Show explicit generate action on cache miss; never generate on page load.

### Task 3: Artifact Canvas, chat, practice, and trace replay

**Owner:** DeepSeek V4 Pro

**Files:**
- Replace: `frontend/src/components/ArtifactContainer.jsx`
- Create: `frontend/src/components/artifact/ArtifactWorkspace.jsx`
- Create: `frontend/src/components/artifact/ArtifactChat.jsx`
- Create: `frontend/src/components/artifact/PracticePanel.jsx`
- Create: `frontend/src/components/visuals/QueueVisual.jsx`
- Create: `frontend/src/components/visuals/TraceControls.jsx`
- Create: `frontend/src/components/visuals/visualRegistry.js`

- [ ] Render story premise, objective, decisions, connected lenses, examples, visual, practice, and next nodes in one workspace.
- [ ] Make Queue enqueue/dequeue/reset controls update visible state and session memory.
- [ ] Add chat history, quick actions, input, pending/error states, and bounded artifact context.
- [ ] Add code editor, run button for backend-supported Python Queue, test result, and trace replay.
- [ ] Add play, pause, step, replay, and reset controls driven by `traceEvents`.
- [ ] Show an honest unsupported-language message instead of fake run behavior.
- [ ] Use a safe unsupported-visual fallback; never render model HTML.

### Task 4: Visual system, responsive behavior, and verification

**Owner:** GLM 5.2 implementation review, DeepSeek fixes

**Files:**
- Replace: `frontend/src/styles.css`
- Delete: obsolete `frontend/src/components/tabs/*.jsx`
- Update: `frontend/src/components/QueuePreview.jsx` if retained, otherwise delete

- [ ] Implement the approved dark editorial/game-field visual language from the browser mockup.
- [ ] Keep chat secondary on desktop and collapsible below the canvas on mobile.
- [ ] Add visible focus, semantic labels, reduced-motion behavior, and usable 320px layout.
- [ ] Remove old Story/Explore/Practice/Review product assumptions and Queue-only navigation.
- [ ] Run frontend tests and production build.
- [ ] Run backend regression tests.
- [ ] Browser-test Profile Builder, Game Field, artifact generation state, Queue interactions, chat, and responsive layout.
