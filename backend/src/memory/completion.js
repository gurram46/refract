export const ALLOWED_COMPLETION_RULE_KINDS = new Set(["required-scenes", "required-checkpoints"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function normalizeStringIds(ids) {
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((id) => isNonEmptyString(id)));
}

function collectDeclaredScenes(artifact) {
  const scenes = new Set();
  const chapters = artifact?.experience?.chapters;
  if (!Array.isArray(chapters)) return scenes;
  for (const chapter of chapters) {
    if (!Array.isArray(chapter?.scenes)) continue;
    for (const scene of chapter.scenes) {
      if (isNonEmptyString(scene?.id)) scenes.add(scene.id);
    }
  }
  return scenes;
}

function collectDeclaredCheckpointSteps(artifact) {
  const steps = new Set();
  const chapters = artifact?.experience?.chapters;
  if (!Array.isArray(chapters)) return steps;
  for (const chapter of chapters) {
    if (!Array.isArray(chapter?.scenes)) continue;
    for (const scene of chapter.scenes) {
      if (!Array.isArray(scene?.steps)) continue;
      for (const step of scene.steps) {
        if (isNonEmptyString(step?.id) && step.checkpoint && typeof step.checkpoint === "object") {
          steps.add(step.id);
        }
      }
    }
  }
  return steps;
}

function evaluateRequiredIds(requiredIds, completedIds, declaredIds) {
  const satisfied = [];
  const missing = [];
  for (const id of requiredIds) {
    if (!isNonEmptyString(id)) continue;
    if (completedIds.has(id) && declaredIds.has(id)) {
      satisfied.push(id);
    } else {
      missing.push(id);
    }
  }
  return { satisfied, missing };
}

function invalidRule(kind) {
  return { kind: kind === "required-scenes" || kind === "required-checkpoints" ? kind : "invalid-rule", satisfied: [], missing: [] };
}

export function computeCompletion(artifact, progress) {
  if (!artifact || typeof artifact !== "object") {
    return { complete: false, satisfied: [], missing: [] };
  }

  const rules = artifact?.experience?.completionRules;
  if (!Array.isArray(rules)) {
    return { complete: false, satisfied: [], missing: [] };
  }
  if (rules.length === 0) {
    return { complete: false, satisfied: [], missing: [invalidRule()] };
  }

  const declaredScenes = collectDeclaredScenes(artifact);
  const declaredCheckpointSteps = collectDeclaredCheckpointSteps(artifact);
  const completedSceneIds = normalizeStringIds(progress?.completedSceneIds);
  const checkpointStepIds = normalizeStringIds(progress?.checkpointStepIds);

  const satisfied = [];
  const missing = [];
  let complete = true;

  for (const rule of rules) {
    if (!rule || typeof rule !== "object") {
      missing.push(invalidRule());
      complete = false;
      continue;
    }
    const kind = rule.kind;

    if (kind === "required-scenes") {
      const sceneIds = rule.sceneIds;
      if (!Array.isArray(sceneIds) || sceneIds.length === 0 || sceneIds.some((id) => !isNonEmptyString(id))) {
        missing.push(invalidRule(kind));
        complete = false;
        continue;
      }
      const result = evaluateRequiredIds(sceneIds, completedSceneIds, declaredScenes);
      const entry = { kind: "required-scenes", satisfied: result.satisfied, missing: result.missing };
      if (result.missing.length > 0) {
        missing.push(entry);
        complete = false;
      } else {
        satisfied.push(entry);
      }
    } else if (kind === "required-checkpoints") {
      const stepIds = rule.stepIds;
      if (!Array.isArray(stepIds) || stepIds.length === 0 || stepIds.some((id) => !isNonEmptyString(id))) {
        missing.push(invalidRule(kind));
        complete = false;
        continue;
      }
      const result = evaluateRequiredIds(stepIds, checkpointStepIds, declaredCheckpointSteps);
      const entry = { kind: "required-checkpoints", satisfied: result.satisfied, missing: result.missing };
      if (result.missing.length > 0) {
        missing.push(entry);
        complete = false;
      } else {
        satisfied.push(entry);
      }
    } else {
      missing.push(invalidRule());
      complete = false;
    }
  }

  return { complete, satisfied, missing };
}
