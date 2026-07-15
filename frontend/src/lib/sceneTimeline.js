import { reduce } from "../components/visuals/workerQueueState.js";

export function seek(initialState, events, step) {
  if (!Array.isArray(events) || events.length === 0) return initialState;
  const bounded = Math.min(step, events.length - 1);
  if (bounded < 0) return initialState;

  let s = initialState;
  for (let i = 0; i <= bounded; i++) {
    s = reduce(s, events[i]);
  }
  return s;
}

export function previous(events, currentStep) {
  const lastIdx = Array.isArray(events) ? events.length - 1 : -1;
  if (lastIdx < 0) return { targetStep: -1 };
  const step = Math.max(-1, Math.min(currentStep - 1, lastIdx));
  return { targetStep: step };
}

export function next(events, currentStep) {
  const lastIdx = Array.isArray(events) ? events.length - 1 : -1;
  if (lastIdx < 0) return { targetStep: -1 };
  if (currentStep < 0) return { targetStep: 0 };
  const step = Math.min(currentStep + 1, lastIdx);
  return { targetStep: step };
}

export function reset(_events, _currentStep) {
  return { targetStep: -1 };
}

export function replay(events, startStep, initState) {
  const lastIdx = Array.isArray(events) ? events.length - 1 : -1;
  const target = lastIdx >= 0 ? 0 : -1;
  return {
    fromStep: startStep,
    targetStep: target,
    state: seek(initState, events, target)
  };
}
