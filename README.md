# Refract

Refract is a local-first AI artifact learning workbench for visual, audio, and hands-on learners.

The goal is not a dashboard and not a normal lesson app. Refract turns topic prompts into durable learning artifacts: explanation, visual model, interaction, practice code, tests, audio script, review, and next steps.

Current direction:

```text
Topic/Profile prompts → validated generated artifact → cached locally → rendered by trusted visual primitives
```

The model generates artifact **content and structured specs**. The app owns the rendering primitives. Normal artifacts must not rely on arbitrary model-written JavaScript.

## Who this is for

Initial learner profiles:

- `sandeep-go-backend` — Go, DSA, backend engineering, and system design.
- `sister-python-ai` — Python, DSA, system design, ML/DS/AI, beginner mode.

Both profiles prioritize:

- visual explanation first,
- audio narration support,
- hands-on practice,
- cross-links between DSA, backend, system design, ML/AI, and game-theory lenses.

## Repo shape

```text
profiles/      learner archetypes and teaching style prompts

topics/        topic prompt files and lens connections
references/    manually curated links and study references
generated/     ignored local cache for generated artifacts/audio
packs/         current seed artifact data while pipeline is being built
backend/       local API, generation, validation, runner, provider routing
frontend/      artifact workbench UI and fixed visual primitives
docs/          runtime/spec/engineering contracts
```

`canvas/` was removed from the active product path. It was an old paste-a-visual/dev demo and does not match the prompt-authored cached artifact runtime. Any useful ideas should be recovered from git history and ported intentionally into `frontend/` or `backend/`.

## Run locally

Backend:

```bash
cd backend
npm install
npm start
```

Default backend:

```text
http://127.0.0.1:8787
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

If port `8787` is busy:

```bash
cd backend
REFRACT_BACKEND_PORT=8797 npm start
```

```bash
cd frontend
VITE_REFRACT_BACKEND_URL=http://127.0.0.1:8797 npm run dev
```

## Test

Backend smoke test:

```bash
cd backend
npm test
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Current status

Committed foundation:

- Phase 0/0.5 spec in `docs/refract-artifact-runtime.md`.
- Local Express backend foundation.
- Queue seed artifact under `packs/dsa-sd-gt/queue.json`.
- Fresh Vite/React frontend shell.
- Strong direction: prompt-authored, generated-once, validated, cached artifacts with fixed visual primitives.

Next implementation direction:

1. Add `profiles/`, `topics/`, `references/`, and `generated/` layout.
2. Add `sandeep-go-backend` and `sister-python-ai` profiles.
3. Add `topics/dsa/queue.md` with `allowedVisualKinds: [queue]`.
4. Add backend profile/topic loader.
5. Add generated artifact JSON validation.
6. Add generate-once cache behavior.
7. Add fixed interactive `queue` visual primitive in `frontend/`.
