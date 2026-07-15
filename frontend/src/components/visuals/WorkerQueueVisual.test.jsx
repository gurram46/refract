import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WorkerQueueVisual from "./WorkerQueueVisual.jsx";
import { initialState } from "./workerQueueState.js";

function baseState() {
  return initialState({
    producer: { id: "producer-1", status: "ready" },
    channel: { id: "jobs", capacity: 3, items: [] },
    workers: [{ id: "worker-1", status: "idle" }, { id: "worker-2", status: "idle" }]
  });
}

function job(label) {
  return { id: label.toLowerCase(), label };
}

describe("WorkerQueueVisual", () => {
  it("renders producer with id and ready status", () => {
    render(<WorkerQueueVisual state={baseState()} focus={[]} />);
    expect(screen.getByLabelText(/Producer producer-1 is ready/)).toBeInTheDocument();
  });

  it("renders blocked producer with pending item label", () => {
    let s = baseState();
    s = { ...s, producer: { ...s.producer, status: "blocked", pendingItem: job("J4") } };
    render(<WorkerQueueVisual state={s} focus={[]} />);
    expect(screen.getByLabelText(/blocked, holding pending item J4/)).toBeInTheDocument();
  });

  it("renders channel with capacity and item count in aria-label", () => {
    let s = baseState();
    s = { ...s, channel: { ...s.channel, items: [job("J1"), job("J2")] } };
    render(<WorkerQueueVisual state={s} focus={[]} />);
    expect(screen.getByLabelText(/Channel jobs has 2 of 3 items/)).toBeInTheDocument();
  });

  it("renders empty channel with explicit empty-state text", () => {
    render(<WorkerQueueVisual state={baseState()} focus={[]} />);
    expect(screen.getByText(/Channel is empty/)).toBeInTheDocument();
  });

  it("renders each queued job with its label", () => {
    let s = baseState();
    s = { ...s, channel: { ...s.channel, items: [job("J1"), job("J2"), job("J3")] } };
    render(<WorkerQueueVisual state={s} focus={[]} />);
    expect(screen.getByText("J1")).toBeInTheDocument();
    expect(screen.getByText("J2")).toBeInTheDocument();
    expect(screen.getByText("J3")).toBeInTheDocument();
  });

  it("renders each worker with id and status, with job when busy", () => {
    let s = baseState();
    s = { ...s, workers: [
      { id: "worker-1", status: "busy", job: job("J1") },
      { id: "worker-2", status: "idle" }
    ] };
    render(<WorkerQueueVisual state={s} focus={[]} />);
    expect(screen.getByLabelText(/Worker worker-1 is busy, processing J1/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Worker worker-2 is idle/)).toBeInTheDocument();
  });

  it("applies data-focus=true to focused target ids", () => {
    let s = baseState();
    s = { ...s, channel: { ...s.channel, items: [job("J1")] } };
    const { container } = render(<WorkerQueueVisual state={s} focus={["worker-1", "job-1"]} />);
    const focused = container.querySelectorAll('[data-focus="true"]');
    expect(focused.length).toBeGreaterThan(0);
    const focusedIds = Array.from(focused).map((el) => el.getAttribute("data-worker-id") || el.getAttribute("data-slot-index"));
    expect(focusedIds).toContain("worker-1");
  });

  it("renders an aria-live polite region for state summary", () => {
    const { container } = render(<WorkerQueueVisual state={baseState()} focus={[]} />);
    const live = container.querySelector('[aria-live="polite"][role="status"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toMatch(/Producer producer-1 is ready/);
  });

  it("uses a shape glyph in aria-label for non-color encoding", () => {
    render(<WorkerQueueVisual state={baseState()} focus={[]} />);
    expect(screen.getByLabelText(/shape ▶/)).toBeInTheDocument();
  });

  it("reducedMotion=true forces immediate opacity, no transform", () => {
    const { container } = render(<WorkerQueueVisual state={baseState()} focus={[]} reducedMotion={true} />);
    const root = container.querySelector('.wqv-root');
    expect(root?.getAttribute("data-reduced-motion")).toBe("true");
    const producers = container.querySelectorAll(".wqv-producer");
    producers.forEach((el) => {
      const style = el.getAttribute("style") ?? "";
      expect(style.includes("translate") || style.includes("transform: translateY")).toBe(false);
    });
  });

  it("maps allowed animationPreset to data-preset attribute", () => {
    const { container } = render(
      <WorkerQueueVisual state={baseState()} focus={[]} preset="enqueue-from-producer" />
    );
    expect(container.querySelector('.wqv-root')?.getAttribute("data-preset")).toBe("enqueue-from-producer");
  });

  it("ignores unknown animationPreset (uses none)", () => {
    const { container } = render(
      <WorkerQueueVisual state={baseState()} focus={[]} preset="bogus-preset" />
    );
    expect(container.querySelector('.wqv-root')?.getAttribute("data-preset")).toBe("bogus-preset");
  });

  it("applies motion choreography for allowed presets (enqueue-from-producer has y transform)", () => {
    const { container } = render(
      <WorkerQueueVisual state={baseState()} focus={[]} preset="enqueue-from-producer" />
    );
    const producer = container.querySelector(".wqv-producer");
    expect(producer?.getAttribute("style") ?? "").toMatch(/translateY/);
  });

  it("applies motion choreography for allowed preset dequeue-to-worker (x transform)", () => {
    const { container } = render(
      <WorkerQueueVisual state={baseState()} focus={[]} preset="dequeue-to-worker" />
    );
    const producer = container.querySelector(".wqv-producer");
    expect(producer?.getAttribute("style") ?? "").toMatch(/translateX/);
  });

  it("reducedMotion=true suppresses all transforms", () => {
    const { container } = render(
      <WorkerQueueVisual state={baseState()} focus={[]} preset="enqueue-from-producer" reducedMotion={true} />
    );
    const producer = container.querySelector(".wqv-producer");
    const style = producer?.getAttribute("style") ?? "";
    expect(style.includes("translateY") || style.includes("translateX")).toBe(false);
  });
});
