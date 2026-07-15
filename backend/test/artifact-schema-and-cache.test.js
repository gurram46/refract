import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createArtifactCache } from "../src/artifacts/artifactCache.js";
import { validateArtifact } from "../src/artifacts/artifactSchema.js";
import {
  getV2PrimitiveKinds,
  getV2SemanticEvents,
  getV2AnimationPresets,
  getV2TraceEvents,
  getV2LabKinds,
  getV2CheckpointKinds,
  getV2ExperimentKinds,
  getV2Modes,
  getV2CompletionRuleKinds,
  getV2EvaluationKinds
} from "../src/artifacts/capabilities.js";

const context = {
  profileId: "local-learner-a1b2",
  topicId: "dsa.queue",
  allowedVisualKinds: ["queue"],
  language: "go"
};

const v2Context = {
  profileId: "local-learner-a1b2",
  topicId: "backend.go.concurrency",
  language: "go"
};

const fixturePath = path.join(import.meta.dirname, "fixtures", "worker-queue-v2.json");
const fixtureSource = JSON.parse(await readFile(fixturePath, "utf8"));

function validV2Artifact() {
  return structuredClone(fixtureSource);
}

function validArtifact() {
  return {
    schemaVersion: 1,
    artifactVersion: 1,
    profileId: "local-learner-a1b2",
    topicId: "dsa.queue",
    title: "The overloaded payment lane",
    summary: "Learn FIFO through a constrained retry system.",
    connections: { core: [], paired: [] },
    story: {
      premise: "Payments must wait for retry capacity.",
      objective: "Preserve arrival order while clearing the backlog.",
      decisions: [],
      audioScript: "First in, first out keeps retries fair."
    },
    visual: { kind: "queue", initialState: { items: [] }, controls: [] },
    examples: [],
    practice: {
      language: "go",
      prompt: "Implement a queue.",
      starterCode: "package queue",
      tests: "enqueue then dequeue",
      supportedTraceEvents: ["queue.enqueue", "queue.dequeue"]
    },
    chat: { suggestedQuestions: [] },
    next: []
  };
}

function errorAt(result, pathName, code) {
  assert.ok(result.ok === false || result.status === "invalid");
  assert.ok(
    result.errors.some((error) => error.path === pathName && error.code === code),
    `expected ${code} at ${pathName}, got ${JSON.stringify(result.errors)}`
  );
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "refract-artifacts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("accepts the exact generated Queue artifact contract", () => {
  assert.deepEqual(validateArtifact(validArtifact(), context), {
    ok: true,
    value: validArtifact()
  });
});

test("rejects missing and additional top-level artifact fields", () => {
  const missingStory = validArtifact();
  delete missingStory.story;
  errorAt(validateArtifact(missingStory, context), "$.story", "REQUIRED_FIELD");

  const additionalField = { ...validArtifact(), lenses: {} };
  errorAt(validateArtifact(additionalField, context), "$.lenses", "UNKNOWN_FIELD");
});

test("rejects wrong versions, identifiers, language, and visual kind", () => {
  const cases = [
    ["$.schemaVersion", "INVALID_VERSION", { schemaVersion: 3 }, context],
    ["$.artifactVersion", "INVALID_VERSION", { artifactVersion: 2 }, context],
    ["$.profileId", "IDENTIFIER_MISMATCH", { profileId: "other-learner" }, context],
    ["$.topicId", "IDENTIFIER_MISMATCH", { topicId: "dsa.stack" }, context],
    ["$.practice.language", "LANGUAGE_MISMATCH", { practice: { ...validArtifact().practice, language: "python" } }, context],
    ["$.visual.kind", "UNSUPPORTED_VISUAL_KIND", { visual: { ...validArtifact().visual, kind: "graph" } }, context],
    ["$.profileId", "INVALID_IDENTIFIER", {}, { ...context, profileId: "../learner" }],
    ["$.topicId", "INVALID_IDENTIFIER", {}, { ...context, topicId: "../queue" }]
  ];

  for (const [pathName, code, override, validationContext] of cases) {
    errorAt(validateArtifact({ ...validArtifact(), ...override }, validationContext), pathName, code);
  }
});

test("requires the complete interactive story structure", () => {
  for (const field of ["premise", "objective", "decisions", "audioScript"]) {
    const artifact = validArtifact();
    delete artifact.story[field];
    errorAt(validateArtifact(artifact, context), `$.story.${field}`, "REQUIRED_FIELD");
  }

  const wrongDecisions = validArtifact();
  wrongDecisions.story.decisions = {};
  errorAt(validateArtifact(wrongDecisions, context), "$.story.decisions", "INVALID_TYPE");
});

test("rejects malformed trace event types", () => {
  const invalidTypes = ["enqueue", "Queue.enqueue", "queue..enqueue", "queue/enqueue", "queue.enqueue.now", 42];

  for (const traceType of invalidTypes) {
    const artifact = validArtifact();
    artifact.practice.supportedTraceEvents = [traceType];
    errorAt(validateArtifact(artifact, context), "$.practice.supportedTraceEvents[0]", "INVALID_TRACE_EVENT");
  }
});

test("rejects forbidden executable fields recursively", () => {
  const forbiddenFields = ["html", "jsx", "componentCode", "executableCode"];

  for (const field of forbiddenFields) {
    const artifact = validArtifact();
    artifact.examples.push({ explanation: { nested: [{ [field]: "unsafe" }] } });
    errorAt(validateArtifact(artifact, context), `$.examples[0].explanation.nested[0].${field}`, "FORBIDDEN_FIELD");
  }

  const differentlyCased = validArtifact();
  differentlyCased.visual.initialState.HTML = "<script>alert(1)</script>";
  errorAt(validateArtifact(differentlyCased, context), "$.visual.initialState.HTML", "FORBIDDEN_FIELD");
});

test("rejects artifacts larger than 512 KB by serialized UTF-8 size", () => {
  const artifact = validArtifact();
  artifact.summary = "x".repeat(512 * 1024);

  const result = validateArtifact(artifact, context);

  errorAt(result, "$", "ARTIFACT_TOO_LARGE");
});

test("returns structured content errors instead of throwing", () => {
  const cyclic = validArtifact();
  cyclic.visual.initialState.self = cyclic;

  assert.doesNotThrow(() => validateArtifact(cyclic, context));
  errorAt(validateArtifact(cyclic, context), "$", "NOT_SERIALIZABLE");
  errorAt(validateArtifact(null, context), "$", "INVALID_TYPE");
});

test("writes a validated artifact atomically and validates it again on read", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const operations = [];
  const fs = {
    async readFile(...args) {
      return (await import("node:fs/promises")).readFile(...args);
    },
    async mkdir(...args) {
      operations.push(["mkdir", args[0]]);
      return (await import("node:fs/promises")).mkdir(...args);
    },
    async writeFile(...args) {
      operations.push(["writeFile", args[0]]);
      return (await import("node:fs/promises")).writeFile(...args);
    },
    async rename(...args) {
      operations.push(["rename", args[0], args[1]]);
      return (await import("node:fs/promises")).rename(...args);
    },
    async rm(...args) {
      return (await import("node:fs/promises")).rm(...args);
    }
  };
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact, fs });
  const artifact = validArtifact();

  assert.deepEqual(await cache.write(artifact, context), { status: "written", value: artifact });

  const destination = path.join(generatedRoot, "artifacts", context.profileId, context.topicId, "artifact.json");
  assert.equal(operations[0][0], "mkdir");
  assert.equal(operations[1][0], "writeFile");
  assert.match(path.basename(operations[1][1]), /^artifact\.json\..+\.tmp$/);
  assert.deepEqual(operations[2], ["rename", operations[1][1], destination]);
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), artifact);
  assert.deepEqual(await readdir(path.dirname(destination)), ["artifact.json"]);
  assert.deepEqual(await cache.read(context), { status: "hit", value: artifact });
});

test("does not expand a validated 512 KB artifact while caching it", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });
  const artifact = validArtifact();
  artifact.summary = "";
  const fixedBytes = Buffer.byteLength(JSON.stringify(artifact), "utf8");
  artifact.summary = "x".repeat(512 * 1024 - fixedBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(artifact), "utf8"), 512 * 1024);
  assert.equal(validateArtifact(artifact, context).ok, true);

  await cache.write(artifact, context);

  const destination = path.join(generatedRoot, "artifacts", context.profileId, context.topicId, "artifact.json");
  const cached = await readFile(destination);
  assert.equal(cached.byteLength, 512 * 1024);
});

test("returns a miss without creating cache directories", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });

  assert.deepEqual(await cache.read(context), { status: "miss" });
  assert.deepEqual(await readdir(generatedRoot), []);
});

test("returns invalid for malformed or untrusted cached artifacts", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cacheDirectory = path.join(generatedRoot, "artifacts", context.profileId, context.topicId);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(cacheDirectory, { recursive: true });
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });

  await writeFile(path.join(cacheDirectory, "artifact.json"), "not json", "utf8");
  errorAt(await cache.read(context), "$", "INVALID_JSON");

  const artifact = validArtifact();
  artifact.examples.push({ componentCode: "export default function Pwn() {}" });
  await writeFile(path.join(cacheDirectory, "artifact.json"), JSON.stringify(artifact), "utf8");
  const result = await cache.read(context);
  assert.equal(result.status, "invalid");
  errorAt(result, "$.examples[0].componentCode", "FORBIDDEN_FIELD");
});

test("invalid writes never create cache files or directories", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  let filesystemTouched = false;
  const cache = createArtifactCache({
    generatedRoot,
    validator: validateArtifact,
    fs: new Proxy({}, {
      get() {
        filesystemTouched = true;
        throw new Error("filesystem must not be accessed");
      }
    })
  });
  const artifact = validArtifact();
  artifact.story.executableCode = "process.exit()";

  const result = await cache.write(artifact, context);

  assert.equal(result.status, "invalid");
  errorAt(result, "$.story.executableCode", "FORBIDDEN_FIELD");
  assert.equal(filesystemTouched, false);
  assert.deepEqual(await readdir(generatedRoot), []);
});

test("rejects unsafe cache IDs before any filesystem operation", async () => {
  let filesystemTouched = false;
  const cache = createArtifactCache({
    generatedRoot: "generated",
    validator: validateArtifact,
    fs: new Proxy({}, {
      get() {
        filesystemTouched = true;
        throw new Error("filesystem must not be accessed");
      }
    })
  });

  await assert.rejects(cache.read({ ...context, profileId: "../learner" }), /Invalid profile ID/);
  await assert.rejects(cache.write(validArtifact(), { ...context, topicId: "..\\queue" }), /Invalid topic ID/);
  assert.equal(filesystemTouched, false);
});

// ---------------------------------------------------------------------------
// Artifact V2 contract (worker-queue primitive). See docs/superpowers/specs/
// 2026-07-12-cinematic-visual-artifacts-design.md. V1 validation is preserved
// until cache invalidation is wired in Task 0.4; these tests exercise v2 only.
// ---------------------------------------------------------------------------

function snapshotSteps(artifact) {
  const steps = [];
  for (const chapter of artifact.experience.chapters) {
    for (const scene of chapter.scenes) {
      for (const step of scene.steps) {
        steps.push({ chapterId: chapter.id, sceneId: scene.id, step });
      }
    }
  }
  return steps;
}

test("v2: accepts the valid worker-queue fixture end to end", () => {
  const result = validateArtifact(validV2Artifact(), v2Context);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.value, validV2Artifact());
});

test("v2: rejects unknown and additional top-level contract fields", () => {
  const withExtra = validV2Artifact();
  withExtra.legacySummary = "leftover v1 field";
  errorAt(validateArtifact(withExtra, v2Context), "$.legacySummary", "UNKNOWN_FIELD");

  const withExperienceExtra = validV2Artifact();
  withExperienceExtra.experience.renderer = "trust me";
  errorAt(
    validateArtifact(withExperienceExtra, v2Context),
    "$.experience.renderer",
    "UNKNOWN_FIELD"
  );

  const withPrimitiveExtra = validV2Artifact();
  withPrimitiveExtra.experience.primitive.ecs = true;
  errorAt(
    validateArtifact(withPrimitiveExtra, v2Context),
    "$.experience.primitive.ecs",
    "UNKNOWN_FIELD"
  );
});

test("v2: rejects duplicate IDs across snippets, scenes, steps, and options", () => {
  const dupSnippet = validV2Artifact();
  dupSnippet.experience.snippets.push({ ...dupSnippet.experience.snippets[0] });
  errorAt(
    validateArtifact(dupSnippet, v2Context),
    "$.experience.snippets[1].id",
    "DUPLICATE_ID"
  );

  const dupStep = validV2Artifact();
  dupStep.experience.chapters[0].scenes[0].steps.push({
    ...dupStep.experience.chapters[0].scenes[0].steps[0]
  });
  errorAt(
    validateArtifact(dupStep, v2Context),
    "$.experience.chapters[0].scenes[0].steps[6].id",
    "DUPLICATE_ID"
  );

  const dupOption = validV2Artifact();
  const checkpoint = dupOption.experience.chapters[0].scenes[0].steps[3].checkpoint;
  checkpoint.options.push({ ...checkpoint.options[0] });
  errorAt(
    validateArtifact(dupOption, v2Context),
    "$.experience.chapters[0].scenes[0].steps[3].checkpoint.options[2].id",
    "DUPLICATE_ID"
  );

  const dupScene = validV2Artifact();
  dupScene.experience.chapters[0].scenes.push({
    ...dupScene.experience.chapters[0].scenes[0]
  });
  errorAt(
    validateArtifact(dupScene, v2Context),
    "$.experience.chapters[0].scenes[1].id",
    "DUPLICATE_ID"
  );

  const dupChapter = validV2Artifact();
  dupChapter.experience.chapters.push({ ...dupChapter.experience.chapters[0] });
  errorAt(
    validateArtifact(dupChapter, v2Context),
    "$.experience.chapters[1].id",
    "DUPLICATE_ID"
  );

  const dupExperiment = validV2Artifact();
  dupExperiment.experience.experiments.push({
    ...dupExperiment.experience.experiments[0]
  });
  errorAt(
    validateArtifact(dupExperiment, v2Context),
    "$.experience.experiments[2].id",
    "DUPLICATE_ID"
  );
});

test("v2: rejects invalid duplicate topic ids in next and topics", () => {
  const dupNext = validV2Artifact();
  dupNext.next = ["system-design.queue-backpressure", "system-design.queue-backpressure"];
  errorAt(validateArtifact(dupNext, v2Context), "$.next", "DUPLICATE_TOPIC");
});

test("v2: rejects missing event targets, snippet references, lines, and option references", () => {
  const unknownTarget = validV2Artifact();
  unknownTarget.experience.chapters[0].scenes[0].steps[0].event.target = "ghost-channel";
  errorAt(
    validateArtifact(unknownTarget, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].event.target",
    "MISSING_REFERENCE"
  );

  const unknownSnippet = validV2Artifact();
  unknownSnippet.experience.chapters[0].scenes[0].steps[0].snippet.id = "no-such-snippet";
  errorAt(
    validateArtifact(unknownSnippet, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].snippet.id",
    "MISSING_REFERENCE"
  );

  const outOfRangeLine = validV2Artifact();
  outOfRangeLine.experience.chapters[0].scenes[0].steps[0].snippet.lines = [42];
  errorAt(
    validateArtifact(outOfRangeLine, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].snippet.lines[0]",
    "OUT_OF_BOUNDS"
  );

  const zeroLine = validV2Artifact();
  zeroLine.experience.chapters[0].scenes[0].steps[0].snippet.lines = [0];
  errorAt(
    validateArtifact(zeroLine, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].snippet.lines[0]",
    "OUT_OF_BOUNDS"
  );

  const badAnswer = validV2Artifact();
  badAnswer.experience.chapters[0].scenes[0].steps[3].checkpoint.answer = "neither";
  errorAt(
    validateArtifact(badAnswer, v2Context),
    "$.experience.chapters[0].scenes[0].steps[3].checkpoint.answer",
    "MISSING_REFERENCE"
  );

  const badSceneRule = validV2Artifact();
  badSceneRule.experience.completionRules[0].sceneIds = ["no-such-scene"];
  errorAt(
    validateArtifact(badSceneRule, v2Context),
    "$.experience.completionRules[0].sceneIds[0]",
    "MISSING_REFERENCE"
  );

  const badStepRule = validV2Artifact();
  badStepRule.experience.completionRules[1].stepIds = ["no-such-step"];
  errorAt(
    validateArtifact(badStepRule, v2Context),
    "$.experience.completionRules[1].stepIds[0]",
    "MISSING_REFERENCE"
  );

  const badAnnotationLine = validV2Artifact();
  badAnnotationLine.experience.snippets[0].annotations[0].line = 99;
  errorAt(
    validateArtifact(badAnnotationLine, v2Context),
    "$.experience.snippets[0].annotations[0].line",
    "OUT_OF_BOUNDS"
  );
});

test("v2: rejects focus references to unknown entities", () => {
  const badFocus = validV2Artifact();
  badFocus.experience.chapters[0].scenes[0].steps[0].focus.push("ghost-entity");
  errorAt(
    validateArtifact(badFocus, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].focus[3]",
    "MISSING_REFERENCE"
  );
});

test("v2: rejects unsupported event type, animation preset, checkpoint kind, experiment kind, and lab kind", () => {
  const badEventType = validV2Artifact();
  badEventType.experience.chapters[0].scenes[0].steps[0].event.type = "channel.shrug";
  errorAt(
    validateArtifact(badEventType, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].event.type",
    "UNSUPPORTED_EVENT"
  );

  const badPreset = validV2Artifact();
  badPreset.experience.chapters[0].scenes[0].steps[0].animationPreset = "teleport";
  errorAt(
    validateArtifact(badPreset, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].animationPreset",
    "UNSUPPORTED_ANIMATION_PRESET"
  );

  const badCheckpointKind = validV2Artifact();
  badCheckpointKind.experience.chapters[0].scenes[0].steps[3].checkpoint.kind = "essay";
  errorAt(
    validateArtifact(badCheckpointKind, v2Context),
    "$.experience.chapters[0].scenes[0].steps[3].checkpoint.kind",
    "UNSUPPORTED_CHECKPOINT"
  );

  const badExperimentKind = validV2Artifact();
  badExperimentKind.experience.experiments[0].kind = "unbounded-number";
  errorAt(
    validateArtifact(badExperimentKind, v2Context),
    "$.experience.experiments[0].kind",
    "UNSUPPORTED_EXPERIMENT"
  );

  const untrustedExperiment = validV2Artifact();
  untrustedExperiment.experience.experiments[0].id = "arbitrary-control";
  errorAt(
    validateArtifact(untrustedExperiment, v2Context),
    "$.experience.experiments[0].id",
    "UNSUPPORTED_EXPERIMENT"
  );

  const badLabKind = validV2Artifact();
  badLabKind.lab.kind = "daydream";
  errorAt(validateArtifact(badLabKind, v2Context), "$.lab.kind", "UNSUPPORTED_LAB");

  const badEvalKind = validV2Artifact();
  badEvalKind.lab.evaluation.kind = "gut-feel";
  errorAt(
    validateArtifact(badEvalKind, v2Context),
    "$.lab.evaluation.kind",
    "UNSUPPORTED_EVALUATION"
  );

  const badPrimitiveKind = validV2Artifact();
  badPrimitiveKind.experience.primitive.kind = "actor-model";
  errorAt(
    validateArtifact(badPrimitiveKind, v2Context),
    "$.experience.primitive.kind",
    "UNSUPPORTED_PRIMITIVE"
  );
});

test("v2: rejects out-of-bounds collections, text, code, files, lines, and experiments", () => {
  const noObjectives = validV2Artifact();
  noObjectives.learningObjectives = [];
  errorAt(validateArtifact(noObjectives, v2Context), "$.learningObjectives", "OUT_OF_BOUNDS");

  const tooManyObjectives = validV2Artifact();
  tooManyObjectives.learningObjectives = new Array(17).fill("objective");
  errorAt(
    validateArtifact(tooManyObjectives, v2Context),
    "$.learningObjectives",
    "OUT_OF_BOUNDS"
  );

  const longTitle = validV2Artifact();
  longTitle.title = "x".repeat(201);
  errorAt(validateArtifact(longTitle, v2Context), "$.title", "OUT_OF_BOUNDS");

  const longCaption = validV2Artifact();
  longCaption.experience.chapters[0].scenes[0].steps[0].caption = "x".repeat(281);
  errorAt(
    validateArtifact(longCaption, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].caption",
    "OUT_OF_BOUNDS"
  );

  const longNarration = validV2Artifact();
  longNarration.experience.chapters[0].scenes[0].steps[0].narration = "x".repeat(1201);
  errorAt(
    validateArtifact(longNarration, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].narration",
    "OUT_OF_BOUNDS"
  );

  const longCode = validV2Artifact();
  longCode.experience.snippets[0].code = "x".repeat(16385);
  errorAt(
    validateArtifact(longCode, v2Context),
    "$.experience.snippets[0].code",
    "OUT_OF_BOUNDS"
  );

  const noScenes = validV2Artifact();
  noScenes.experience.chapters[0].scenes = [];
  errorAt(
    validateArtifact(noScenes, v2Context),
    "$.experience.chapters[0].scenes",
    "OUT_OF_BOUNDS"
  );

  const noSteps = validV2Artifact();
  noSteps.experience.chapters[0].scenes[0].steps = [];
  errorAt(
    validateArtifact(noSteps, v2Context),
    "$.experience.chapters[0].scenes[0].steps",
    "OUT_OF_BOUNDS"
  );

  const tooManySteps = validV2Artifact();
  tooManySteps.experience.chapters[0].scenes[0].steps = new Array(201).fill(
    tooManySteps.experience.chapters[0].scenes[0].steps[0]
  );
  errorAt(
    validateArtifact(tooManySteps, v2Context),
    "$.experience.chapters[0].scenes[0].steps",
    "OUT_OF_BOUNDS"
  );

  const badExperimentRange = validV2Artifact();
  badExperimentRange.experience.experiments[0].min = 5;
  badExperimentRange.experience.experiments[0].max = 3;
  errorAt(
    validateArtifact(badExperimentRange, v2Context),
    "$.experience.experiments[0].min",
    "OUT_OF_BOUNDS"
  );

  const badExperimentDefault = validV2Artifact();
  badExperimentDefault.experience.experiments[0].default = 99;
  errorAt(
    validateArtifact(badExperimentDefault, v2Context),
    "$.experience.experiments[0].default",
    "OUT_OF_BOUNDS"
  );

  const missingExperimentStep = validV2Artifact();
  delete missingExperimentStep.experience.experiments[0].step;
  errorAt(
    validateArtifact(missingExperimentStep, v2Context),
    "$.experience.experiments[0].step",
    "REQUIRED_FIELD"
  );

  const longStarterCode = validV2Artifact();
  longStarterCode.lab.files[0].starterCode = "x".repeat(65537);
  errorAt(
    validateArtifact(longStarterCode, v2Context),
    "$.lab.files[0].starterCode",
    "OUT_OF_BOUNDS"
  );

  const tooManyChatSuggestions = validV2Artifact();
  tooManyChatSuggestions.chat.suggestedQuestions = new Array(13).fill("Why?");
  errorAt(
    validateArtifact(tooManyChatSuggestions, v2Context),
    "$.chat.suggestedQuestions",
    "OUT_OF_BOUNDS"
  );
});

test("v2: rejects artifacts larger than 512 KB by serialized UTF-8 size", () => {
  const huge = validV2Artifact();
  huge.experience.snippets[0].code = "x".repeat(512 * 1024);
  const result = validateArtifact(huge, v2Context);
  errorAt(result, "$", "ARTIFACT_TOO_LARGE");
});

test("v2: rejects forbidden executable fields recursively within v2 structures", () => {
  const atSnippet = validV2Artifact();
  atSnippet.experience.snippets[0].html = "<script>alert(1)</script>";
  errorAt(
    validateArtifact(atSnippet, v2Context),
    "$.experience.snippets[0].html",
    "FORBIDDEN_FIELD"
  );

  const atLabFile = validV2Artifact();
  atLabFile.lab.files[0].componentCode = "export default";
  errorAt(
    validateArtifact(atLabFile, v2Context),
    "$.lab.files[0].componentCode",
    "FORBIDDEN_FIELD"
  );

  const atPrimitive = validV2Artifact();
  atPrimitive.experience.primitive.initialState.executableCode = "process.exit()";
  errorAt(
    validateArtifact(atPrimitive, v2Context),
    "$.experience.primitive.initialState.executableCode",
    "FORBIDDEN_FIELD"
  );

  const differentlyCased = validV2Artifact();
  differentlyCased.experience.chapters[0].scenes[0].steps[0].payload = {
    JSX: "<evil/>"
  };
  errorAt(
    validateArtifact(differentlyCased, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].payload.JSX",
    "FORBIDDEN_FIELD"
  );
});

test("v2: rejects an impossible worker-queue event sequence via deterministic simulation", () => {
  const dequeueFromEmpty = validV2Artifact();
  const steps = dequeueFromEmpty.experience.chapters[0].scenes[0].steps;
  steps.unshift({
    id: "phantom-receive",
    event: {
      type: "worker.receive",
      target: "worker-1",
      payload: { item: { id: "job-never", label: "JX" } }
    },
    focus: ["worker-1", "jobs", "job-never"],
    snippet: { id: "send-loop", lines: [2] },
    caption: "Worker receives before anything is queued.",
    narration: "A worker cannot receive from an empty buffer.",
    animationPreset: "dequeue-to-worker"
  });
  errorAt(
    validateArtifact(dequeueFromEmpty, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].event",
    "IMPOSSIBLE_SEQUENCE"
  );

  const completeWithoutReceive = validV2Artifact();
  const steps2 = completeWithoutReceive.experience.chapters[0].scenes[0].steps;
  steps2.unshift({
    id: "phantom-complete",
    event: {
      type: "worker.complete",
      target: "worker-1",
      payload: { item: { id: "job-never", label: "JX" } }
    },
    focus: ["worker-1", "job-never"],
    snippet: { id: "send-loop", lines: [2] },
    caption: "Worker completes a job it never received.",
    narration: "A worker cannot finish work it never started.",
    animationPreset: "worker-complete"
  });
  errorAt(
    validateArtifact(completeWithoutReceive, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].event",
    "IMPOSSIBLE_SEQUENCE"
  );

  const sendBlockedOnEmpty = validV2Artifact();
  const steps3 = sendBlockedOnEmpty.experience.chapters[0].scenes[0].steps;
  steps3.unshift({
    id: "phantom-block",
    event: {
      type: "channel.send-blocked",
      target: "producer-1",
      payload: { item: { id: "job-never", label: "JX" } }
    },
    focus: ["producer-1", "jobs"],
    snippet: { id: "send-loop", lines: [2] },
    caption: "Producer blocked before the channel is full.",
    narration: "A send cannot block when buffer space remains.",
    animationPreset: "show-blocked"
  });
  errorAt(
    validateArtifact(sendBlockedOnEmpty, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].event",
    "IMPOSSIBLE_SEQUENCE"
  );

  const duplicateSend = validV2Artifact();
  const dupSteps = duplicateSend.experience.chapters[0].scenes[0].steps;
  dupSteps[1].event.payload.item.id = dupSteps[0].event.payload.item.id;
  errorAt(
    validateArtifact(duplicateSend, v2Context),
    "$.experience.chapters[0].scenes[0].steps[1].event",
    "IMPOSSIBLE_SEQUENCE"
  );
});

test("v2: rejects unsatisfiable completion rules and predicts requiring at least one option", () => {
  const emptyCheckpoint = validV2Artifact();
  emptyCheckpoint.experience.chapters[0].scenes[0].steps[3].checkpoint.options = [];
  errorAt(
    validateArtifact(emptyCheckpoint, v2Context),
    "$.experience.chapters[0].scenes[0].steps[3].checkpoint.options",
    "OUT_OF_BOUNDS"
  );

  const emptyRequiredScenes = validV2Artifact();
  emptyRequiredScenes.experience.completionRules[0].sceneIds = [];
  errorAt(
    validateArtifact(emptyRequiredScenes, v2Context),
    "$.experience.completionRules[0].sceneIds",
    "OUT_OF_BOUNDS"
  );

  const noCompletionRules = validV2Artifact();
  noCompletionRules.experience.completionRules = [];
  errorAt(
    validateArtifact(noCompletionRules, v2Context),
    "$.experience.completionRules",
    "OUT_OF_BOUNDS"
  );

  const duplicateSceneRule = validV2Artifact();
  duplicateSceneRule.experience.completionRules[0].sceneIds = ["buffer-fills", "buffer-fills"];
  errorAt(
    validateArtifact(duplicateSceneRule, v2Context),
    "$.experience.completionRules[0].sceneIds",
    "DUPLICATE_REFERENCE"
  );

  const duplicateStepRule = validV2Artifact();
  duplicateStepRule.experience.completionRules[1].stepIds = ["send-blocks", "send-blocks"];
  errorAt(
    validateArtifact(duplicateStepRule, v2Context),
    "$.experience.completionRules[1].stepIds",
    "DUPLICATE_REFERENCE"
  );
});

test("v2: rejects disruptive fields at experience, primitive, chapter, scene, step, snippet, experiment, and lab boundaries", () => {
  const extraAtScene = validV2Artifact();
  extraAtScene.experience.chapters[0].scenes[0].durationMs = 5000;
  errorAt(
    validateArtifact(extraAtScene, v2Context),
    "$.experience.chapters[0].scenes[0].durationMs",
    "UNKNOWN_FIELD"
  );

  const extraAtStep = validV2Artifact();
  extraAtStep.experience.chapters[0].scenes[0].steps[0].rewardPoints = 10;
  errorAt(
    validateArtifact(extraAtStep, v2Context),
    "$.experience.chapters[0].scenes[0].steps[0].rewardPoints",
    "UNKNOWN_FIELD"
  );

  const extraAtSnippet = validV2Artifact();
  extraAtSnippet.experience.snippets[0].runnable = true;
  errorAt(
    validateArtifact(extraAtSnippet, v2Context),
    "$.experience.snippets[0].runnable",
    "UNKNOWN_FIELD"
  );

  const extraAtLab = validV2Artifact();
  extraAtLab.lab.timeoutSeconds = 7;
  errorAt(validateArtifact(extraAtLab, v2Context), "$.lab.timeoutSeconds", "UNKNOWN_FIELD");

  const extraAtExperiment = validV2Artifact();
  extraAtExperiment.experience.experiments[0].unit = "ms";
  errorAt(
    validateArtifact(extraAtExperiment, v2Context),
    "$.experience.experiments[0].unit",
    "UNKNOWN_FIELD"
  );
});

test("v2: rejects primitive kind absent from capability manifest", () => {
  const badPrimitive = validV2Artifact();
  badPrimitive.experience.primitive.kind = "stack-machine";
  errorAt(
    validateArtifact(badPrimitive, v2Context),
    "$.experience.primitive.kind",
    "UNSUPPORTED_PRIMITIVE"
  );
});

test("v2: rejects lab kind absent from capability manifest", () => {
  const badLab = validV2Artifact();
  badLab.lab.kind = "essay";
  errorAt(validateArtifact(badLab, v2Context), "$.lab.kind", "UNSUPPORTED_LAB");
});

test("capabilities: backend projection exports match shared manifest expectations", () => {
  assert.deepEqual([...getV2PrimitiveKinds()], ["worker-queue"]);
  assert.deepEqual([...getV2SemanticEvents()], ["channel.send", "channel.send-blocked", "worker.receive", "worker.complete"]);
  assert.deepEqual([...getV2AnimationPresets()], ["enqueue-from-producer", "show-blocked", "dequeue-to-worker", "worker-complete", "idle"]);
  assert.deepEqual([...getV2TraceEvents()], ["channel.send", "channel.send-blocked", "worker.receive", "worker.complete"]);
  assert.deepEqual([...getV2LabKinds()], ["code"]);
  assert.deepEqual([...getV2CheckpointKinds()], ["prediction"]);
  assert.deepEqual([...getV2ExperimentKinds()], ["bounded-number"]);
  assert.deepEqual([...getV2Modes()], ["guided-lab"]);
  assert.deepEqual([...getV2CompletionRuleKinds()], ["required-scenes", "required-checkpoints"]);
  assert.deepEqual([...getV2EvaluationKinds()], ["go-tests"]);
});

test("capabilities: backend and frontend projections agree on every capability dimension", async () => {
  const sharedRaw = await readFile(
    path.join(import.meta.dirname, "..", "..", "shared", "artifact-capabilities.json"),
    "utf8"
  );
  const shared = JSON.parse(sharedRaw);
  const imp = shared.implemented;

  assert.deepEqual([...getV2PrimitiveKinds()].sort(), [...imp.primitiveKinds["schema-2"]].sort());
  assert.deepEqual([...getV2SemanticEvents()].sort(), [...imp.semanticEventTypes["worker-queue"]].sort());
  assert.deepEqual([...getV2AnimationPresets()].sort(), [...imp.animationPresets["worker-queue"]].sort());
  assert.deepEqual([...getV2TraceEvents()].sort(), [...imp.traceEvents["schema-2"]["worker-queue"]].sort());
  assert.deepEqual([...getV2LabKinds()].sort(), [...imp.labKinds["schema-2"]].sort());
  assert.deepEqual([...getV2CheckpointKinds()].sort(), [...imp.checkpointKinds["guided-lab"]].sort());
  assert.deepEqual([...getV2ExperimentKinds()].sort(), [...imp.experimentKinds["guided-lab"]].sort());
  assert.deepEqual([...getV2Modes()].sort(), [...imp.experienceModes["schema-2"]].sort());
  assert.deepEqual([...getV2CompletionRuleKinds()].sort(), [...imp.completionRuleKinds["guided-lab"]].sort());
  assert.deepEqual([...getV2EvaluationKinds()].sort(), [...imp.evaluationKinds.code].sort());
});

test("v2: v1 artifacts remain valid under v1 context until cache invalidation is wired", () => {
  assert.equal(validateArtifact(validArtifact(), context).ok, true);
});

// ---------------------------------------------------------------------------
// Task 0.4: Cache version cutover. The generated cache invalidates v1 entries
// for the v2 runtime (reported as stale, treated as not_generated) and v2
// entries remain hits. Invalid cache stays quarantined as invalid. Static
// legacy pack artifacts are loaded through a separate code path and never
// enter the generated cache. See docs/superpowers/specs/2026-07-12-cinematic-
// visual-artifacts-design.md#migration.
// ---------------------------------------------------------------------------

test("v2 cache hit remains a hit when expectedSchemaVersion is 2", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });
  const artifact = validV2Artifact();
  const ctx = { ...v2Context, expectedSchemaVersion: 2 };

  assert.deepEqual(await cache.write(artifact, v2Context), { status: "written", value: artifact });

  const result = await cache.read(ctx);
  assert.equal(result.status, "hit");
  assert.deepEqual(result.value, artifact);
});

test("v1 generated cache is reported stale when expectedSchemaVersion is 2 and is not rendered as v2", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });
  const v1Artifact = validArtifact();
  const ctx = { profileId: v1Artifact.profileId, topicId: v1Artifact.topicId, allowedVisualKinds: ["queue"], language: "go", expectedSchemaVersion: 2 };

  assert.equal((await cache.write(v1Artifact, context)).status, "written");

  const staleResult = await cache.read(ctx);
  assert.equal(staleResult.status, "stale");
  assert.equal(staleResult.value, undefined, "stale entries must not leak the v1 artifact as a value");
  assert.equal(staleResult.errors, undefined, "stale is a version cutover signal, not a validation failure");
});

test("regeneration writes a valid v2 artifact atomically and rereads it as a hit after a stale v1 entry", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const directory = path.dirname(
    path.join(generatedRoot, "artifacts", v2Context.profileId, v2Context.topicId, "artifact.json")
  );
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });

  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });
  await writeFile(
    path.join(directory, "artifact.json"),
    JSON.stringify(validArtifact()),
    "utf8"
  );

  const ctx = { ...v2Context, expectedSchemaVersion: 2 };
  assert.equal((await cache.read(ctx)).status, "stale");

  const v2Artifact = validV2Artifact();
  const writeResult = await cache.write(v2Artifact, v2Context);
  assert.equal(writeResult.status, "written");
  assert.deepEqual(await cache.read(ctx), { status: "hit", value: v2Artifact });

  const { readFile } = await import("node:fs/promises");
  const persisted = JSON.parse(await readFile(path.join(directory, "artifact.json"), "utf8"));
  assert.equal(persisted.schemaVersion, 2, "regeneration must replace the v1 entry with v2 atomically");
});

test("invalid cache remains quarantined from runtime use even when expectedSchemaVersion is set", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cacheDirectory = path.join(generatedRoot, "artifacts", v2Context.profileId, v2Context.topicId);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(cacheDirectory, { recursive: true });
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });

  await writeFile(path.join(cacheDirectory, "artifact.json"), "not json", "utf8");
  errorAt(await cache.read({ ...v2Context, expectedSchemaVersion: 2 }), "$", "INVALID_JSON");

  const forbidden = validV2Artifact();
  forbidden.experience.snippets[0].html = "<script>alert(1)</script>";
  await writeFile(path.join(cacheDirectory, "artifact.json"), JSON.stringify(forbidden), "utf8");
  const result = await cache.read({ ...v2Context, expectedSchemaVersion: 2 });
  assert.equal(result.status, "invalid");
  assert.notEqual(result.status, "stale", "invalid must not be masked as stale");
});

test("v1 cache entry stays a hit when no expectedSchemaVersion is requested (v1 runtime remains intact)", async (t) => {
  const generatedRoot = await temporaryDirectory(t);
  const cache = createArtifactCache({ generatedRoot, validator: validateArtifact });
  const v1Artifact = validArtifact();

  const writeResult = await cache.write(v1Artifact, context);
  assert.equal(writeResult.status, "written");
  const readResult = await cache.read(context);
  assert.equal(readResult.status, "hit");
});
