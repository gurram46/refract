import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import VisualStage from "./VisualStage.jsx";
import { initialState } from "../visuals/workerQueueState.js";

const INIT = initialState({
  producer: { id: "producer-1", status: "ready" },
  channel: { id: "jobs", capacity: 3, items: [] },
  workers: [{ id: "worker-1", status: "idle" }]
});

function job(label) {
  return { id: label.toLowerCase(), label };
}

const STEPS = [
  { id: "s1", event: { type: "channel.send", target: "jobs", payload: { item: job("J1") } }, focus: ["producer-1"], caption: "J1 enters", narration: "first send", animationPreset: "enqueue-from-producer" },
  { id: "s2", event: { type: "channel.send", target: "jobs", payload: { item: job("J2") } }, focus: ["jobs"], caption: "J2 enters", narration: "two thirds", animationPreset: "enqueue-from-producer" },
  { id: "s3", event: { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } }, focus: ["worker-1"], caption: "Worker 1 takes J1", narration: "frees space", animationPreset: "dequeue-to-worker" }
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VisualStage — canonical state from reducer", () => {
  it("derives view state from step 0 (J1 in channel)", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} />);
    expect(screen.getByLabelText(/Channel jobs has 1 of 3 items/)).toBeInTheDocument();
    expect(screen.getByText("J1")).toBeInTheDocument();
  });

  it("derives view state from step 2 (worker busy with J1, channel has J2)", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={2} />);
    expect(screen.getByLabelText(/Worker worker-1 is busy, processing J1/)).toBeInTheDocument();
  });

  it("renders the active step's caption only", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={1} />);
    expect(screen.getByText("J2 enters")).toBeInTheDocument();
    expect(screen.queryByText("J1 enters")).toBeNull();
  });

  it("applies the active step's focus ids to data-focus", () => {
    const { container } = render(<VisualStage initialState={INIT} steps={STEPS} currentStep={2} />);
    const focused = container.querySelectorAll('[data-focus="true"]');
    expect(focused.length).toBeGreaterThan(0);
  });

  it("out-of-range currentStep falls back to last event state", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={999} />);
    expect(screen.getByLabelText(/Worker worker-1 is busy/)).toBeInTheDocument();
  });

  it("empty steps list renders initial state without errors", () => {
    render(<VisualStage initialState={INIT} steps={[]} currentStep={0} />);
    expect(screen.getByText(/Channel is empty/)).toBeInTheDocument();
  });
});

describe("VisualStage — autoplay advancement (fake timers)", () => {
  it("advances to next step after the speed timer elapses", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
    expect(screen.getAllByText(/Step 1 of 3/).length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getAllByText(/Step 2 of 3/).length).toBeGreaterThan(0);
  });

  it("auto-pauses when reaching the last step", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
    act(() => { vi.advanceTimersByTime(1300); });
    act(() => { vi.advanceTimersByTime(1300); });
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getAllByText(/Step 3 of 3/).length).toBeGreaterThan(0);
    const playBtn = screen.getByRole("button", { name: "Play" });
    expect(playBtn).not.toBeDisabled();
  });

  it("pause clears the pending timer (no step change after pause)", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
    act(() => { vi.advanceTimersByTime(600); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Pause" })); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getAllByText(/Step 1 of 3/).length).toBeGreaterThan(0);
  });

  it("changing speed restarts the timer with the new delay", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
    act(() => { vi.advanceTimersByTime(600); });
    act(() => { fireEvent.change(screen.getByLabelText("Playback speed"), { target: { value: "0.5" } }); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getAllByText(/Step 1 of 3/).length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getAllByText(/Step 2 of 3/).length).toBeGreaterThan(0);
  });

  it("Replay returns to step 0 and continues playing deterministically", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
    act(() => { vi.advanceTimersByTime(1300); });
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getAllByText(/Step 3 of 3/).length).toBeGreaterThan(0);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Replay from start" })); });
    expect(screen.getAllByText(/Step 1 of 3/).length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getAllByText(/Step 2 of 3/).length).toBeGreaterThan(0);
  });

  it("unmount clears pending timer (no leak)", () => {
    const { unmount } = render(<VisualStage initialState={INIT} steps={STEPS} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
    unmount();
    expect(() => { act(() => { vi.advanceTimersByTime(5000); }); }).not.toThrow();
  });
});

describe("VisualStage — Next / Previous", () => {
  it("Next advances by one step (controlled via button)", () => {
    const onStepChange = vi.fn();
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} onStepChange={onStepChange} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Next step" })); });
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it("Next button is disabled at the end", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={2} />);
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
  });

  it("Previous button is disabled at the start", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} />);
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
  });
});

describe("VisualStage — keyboard and focus semantics", () => {
  it("focuses the Play button when focused", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    const play = screen.getByRole("button", { name: "Play" });
    play.focus();
    expect(document.activeElement).toBe(play);
    expect(play).toHaveFocus();
  });

  it("toolbar has role='toolbar' with an accessible name", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} />);
    expect(screen.getByRole("toolbar", { name: "Playback controls" })).toBeInTheDocument();
  });

  it("renders polite live region for state announcements", () => {
    const { container } = render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});

describe("VisualStage — reduced-motion / no-animation", () => {
  it("OS-preference is the default; reducedMotion override forces it", () => {
    const { container: a } = render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} />);
    expect(a.querySelector('.wqv-root')?.getAttribute("data-reduced-motion")).toBe("false");

    const { container: b } = render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} reducedMotion={true} />);
    expect(b.querySelector('.wqv-root')?.getAttribute("data-reduced-motion")).toBe("true");

    const { container: c } = render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} reducedMotion={false} />);
    expect(c.querySelector('.wqv-root')?.getAttribute("data-reduced-motion")).toBe("false");
  });

  it("reducedMotion override does not lie: when false, motion props are passed through", () => {
    const { container } = render(<VisualStage initialState={INIT} steps={STEPS} currentStep={0} reducedMotion={false} preset="enqueue-from-producer" />);
    const root = container.querySelector('.wqv-root');
    expect(root?.getAttribute("data-reduced-motion")).toBe("false");
    expect(root?.getAttribute("data-preset")).toBe("enqueue-from-producer");
  });
});

describe("VisualStage — invalid events remain diagnosable", () => {
  it("unknown animationPreset on a step does not crash the stage", () => {
    const badSteps = [
      { id: "x", event: { type: "channel.send", target: "jobs", payload: { item: job("J1") } }, caption: "ok", animationPreset: "totally-bogus" }
    ];
    render(<VisualStage initialState={INIT} steps={badSteps} currentStep={0} />);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("shows a reducer diagnostic instead of silently presenting an invalid timeline state", () => {
    const invalidSteps = [
      { id: "blocked-too-early", event: { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J1") } }, caption: "invalid" }
    ];
    render(<VisualStage initialState={INIT} steps={invalidSteps} currentStep={0} />);
    expect(screen.getByRole("alert")).toHaveTextContent("channel has free space");
  });
});

const STEP_WITH_SNIPPET = {
  id: "send-snippet",
  event: { type: "channel.send", target: "jobs", payload: { item: job("J1") } },
  focus: ["producer-1"],
  snippet: { id: "send-loop", lines: [2] },
  caption: "J1 enters",
  animationPreset: "enqueue-from-producer"
};

const STEP2_WITH_SNIPPET = {
  id: "send-snippet-2",
  event: { type: "channel.send", target: "jobs", payload: { item: job("J2") } },
  focus: ["producer-1"],
  snippet: { id: "send-loop", lines: [1] },
  caption: "J2 enters",
  animationPreset: "enqueue-from-producer"
};

import { Suspense, lazy } from "react";

const SNIPPETS = [
  {
    id: "send-loop",
    language: "go",
    file: "main.go",
    code: "for _, job := range jobs {\n    queue <- job\n}",
    editable: false,
    annotations: [{ line: 2, text: "This send waits when the buffer is full." }]
  }
];

describe("VisualStage — snippet synchronization", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders the snippet bound to the active step", async () => {
    const { container } = render(
      <VisualStage initialState={INIT} steps={[STEP_WITH_SNIPPET]} currentStep={0} snippets={SNIPPETS} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-snippet-id="send-loop"]')).toBeInTheDocument();
    });
    expect(container.querySelector('[data-active-lines="2"]')).toBeInTheDocument();
  });

  it("shows an accessible loading fallback while a lazy snippet is loading", async () => {
    const LazySnippet = lazy(() => new Promise((resolve) => {
      setTimeout(() => resolve(import("./SceneCodeSnippet.jsx")), 50);
    }));
    const { container } = render(
      <Suspense fallback={<div className="snippet-loading" role="status" aria-live="polite" aria-busy="true">Loading code snippet…</div>}>
        <LazySnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
      </Suspense>
    );
    expect(container.querySelector(".snippet-loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector(".scene-code-snippet")).toBeInTheDocument();
    });
  });

  it("updates active snippet lines when the step changes", async () => {
    const { container, rerender } = render(
      <VisualStage initialState={INIT} steps={[STEP_WITH_SNIPPET, STEP2_WITH_SNIPPET]} currentStep={0} snippets={SNIPPETS} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-active-lines="2"]')).toBeInTheDocument();
    });
    rerender(
      <VisualStage initialState={INIT} steps={[STEP_WITH_SNIPPET, STEP2_WITH_SNIPPET]} currentStep={1} snippets={SNIPPETS} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-active-lines="1"]')).toBeInTheDocument();
    });
  });

  it("does not render snippet panel when the step has no snippet binding", () => {
    const stepWithoutSnippet = { id: "no-snippet", event: { type: "channel.send", target: "jobs", payload: { item: job("J1") } }, caption: "No snippet" };
    const { container } = render(
      <VisualStage initialState={INIT} steps={[stepWithoutSnippet]} currentStep={0} snippets={SNIPPETS} />
    );
    expect(container.querySelector(".visual-stage-snippets")).toBeNull();
  });

  it("honors highlightLines as an alias for lines", async () => {
    const stepWithHighlightLines = { ...STEP_WITH_SNIPPET, snippet: { id: "send-loop", highlightLines: [2] } };
    const { container } = render(
      <VisualStage initialState={INIT} steps={[stepWithHighlightLines]} currentStep={0} snippets={SNIPPETS} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-active-lines="2"]')).toBeInTheDocument();
    });
  });
});

const PREDICTION_CHECKPOINT = {
  kind: "prediction",
  question: "What lets the producer continue?",
  options: [
    { id: "receive", label: "A worker receives a job" },
    { id: "time", label: "Time passes automatically" }
  ],
  answer: "receive",
  explanation: "Receiving frees one channel slot."
};

const STEP_WITH_CHECKPOINT = {
  id: "send-blocks",
  event: { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } },
  focus: ["producer-1", "jobs"],
  caption: "The next send waits.",
  checkpoint: PREDICTION_CHECKPOINT
};

const EXPERIMENTS = [
  { id: "worker-count", kind: "bounded-number", min: 1, max: 4, default: 1 },
  { id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, default: 3 }
];

describe("VisualStage — predictions and experiments", () => {
  it("renders a prediction checkpoint when the active step has one", () => {
    render(<VisualStage initialState={INIT} steps={[STEP_WITH_CHECKPOINT]} currentStep={0} />);
    expect(screen.getByText("What lets the producer continue?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeInTheDocument();
  });

  it("renders an experiment tray when experiments are provided", () => {
    render(<VisualStage initialState={INIT} steps={STEPS} experiments={EXPERIMENTS} />);
    expect(screen.getByLabelText("Experiments")).toBeInTheDocument();
  });

  it("applies experiment state to the initial channel capacity", () => {
    render(
      <VisualStage
        initialState={INIT}
        steps={STEPS}
        experiments={[{ id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, step: 1, default: 3 }]}
        experimentState={{ "channel-capacity": 6 }}
      />
    );
    expect(screen.getByLabelText(/Channel jobs has 0 of 6 items/)).toBeInTheDocument();
  });

  it("applies experiment state to add workers", () => {
    render(
      <VisualStage
        initialState={INIT}
        steps={STEPS}
        experiments={[{ id: "worker-count", kind: "bounded-number", min: 1, max: 4, step: 1, default: 1 }]}
        experimentState={{ "worker-count": 2 }}
      />
    );
    expect(screen.getByLabelText(/Worker worker-2 is idle/)).toBeInTheDocument();
  });

  it("ignores arbitrary persisted experiment IDs at the reducer boundary", () => {
    render(
      <VisualStage
        initialState={INIT}
        steps={STEPS}
        experiments={[{ id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, step: 1, default: 3 }]}
        session={{ progress: { experimentState: { injected: 999 } } }}
      />
    );
    expect(screen.getByLabelText(/Channel jobs has 0 of 3 items/)).toBeInTheDocument();
  });

  it("shows an accessible error when an experiment update is not saved", async () => {
    const onUpdateSession = vi.fn(() => ({ ok: false, error: "Could not save experiment." }));
    render(
      <VisualStage
        initialState={INIT}
        steps={STEPS}
        experiments={[{ id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, step: 1, default: 3 }]}
        session={{ progress: { checkpointStepIds: [], completedSceneIds: [], experimentState: {} } }}
        onUpdateSession={onUpdateSession}
      />
    );
    fireEvent.change(screen.getByLabelText("channel-capacity value 3"), { target: { value: "4" } });
    await act(async () => {});
    expect(screen.getByText("Could not save experiment.")).toHaveAttribute("role", "alert");
  });

  it("records a checkpoint answer via onUpdateSession", async () => {
    const onUpdateSession = vi.fn(() => ({ ok: true }));
    const session = { progress: { checkpointStepIds: [], completedSceneIds: [], experimentState: {} } };
    const { container } = render(
      <VisualStage
        initialState={INIT}
        steps={[STEP_WITH_CHECKPOINT]}
        currentStep={0}
        session={session}
        onUpdateSession={onUpdateSession}
      />
    );
    fireEvent.click(screen.getByLabelText("A worker receives a job"));
    await act(async () => { fireEvent.submit(container.querySelector(".prediction-checkpoint")); });
    expect(onUpdateSession).toHaveBeenCalled();
    const patch = onUpdateSession.mock.calls[0][0];
    expect(patch.progress.checkpointStepIds).toContain("send-blocks");
    expect(screen.getByText("Receiving frees one channel slot.")).toBeInTheDocument();
  });

  it("shows a save error when the session update returns ok:false", async () => {
    const onUpdateSession = vi.fn(() => ({ ok: false, error: "Could not save answer." }));
    const { container } = render(
      <VisualStage
        initialState={INIT}
        steps={[STEP_WITH_CHECKPOINT]}
        currentStep={0}
        session={{ progress: { checkpointStepIds: [], completedSceneIds: [], experimentState: {} } }}
        onUpdateSession={onUpdateSession}
      />
    );
    fireEvent.click(screen.getByLabelText("A worker receives a job"));
    await act(async () => { fireEvent.submit(container.querySelector(".prediction-checkpoint")); });
    expect(screen.getByText("Could not save answer.")).toHaveAttribute("role", "alert");
  });

  it("shows a scene save error and retries without marking the scene complete", async () => {
    const onUpdateSession = vi.fn(() => ({ ok: false, error: "Could not save scene progress." }));
    render(
      <VisualStage
        initialState={INIT}
        steps={[STEP_WITH_CHECKPOINT]}
        scenes={[{ id: "buffer-fills", steps: [STEP_WITH_CHECKPOINT] }]}
        currentStep={0}
        session={{ progress: { checkpointStepIds: [], completedSceneIds: [], experimentState: {} } }}
        onUpdateSession={onUpdateSession}
      />
    );
    await act(async () => {});
    expect(screen.getByText("Could not save scene progress.").parentElement).toHaveAttribute("role", "alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry saving scene progress" }));
    await act(async () => {});
    expect(onUpdateSession).toHaveBeenCalledTimes(2);
  });
});
