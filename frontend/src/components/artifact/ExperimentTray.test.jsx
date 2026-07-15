import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExperimentTray from "./ExperimentTray.jsx";

const EXPERIMENTS = [
  { id: "worker-count", kind: "bounded-number", min: 1, max: 4, step: 1, default: 1 },
  { id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, step: 1, default: 3 }
];

describe("ExperimentTray", () => {
  it("renders a slider for each experiment", () => {
    render(<ExperimentTray experiments={EXPERIMENTS} />);
    expect(screen.getByLabelText("worker-count value 1")).toBeInTheDocument();
    expect(screen.getByLabelText("channel-capacity value 3")).toBeInTheDocument();
  });

  it("returns null when there are no experiments", () => {
    const { container } = render(<ExperimentTray experiments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("uses the default when persisted value is outside the allowed range", () => {
    render(<ExperimentTray experiments={EXPERIMENTS} experimentState={{ "channel-capacity": 20 }} />);
    expect(screen.getByLabelText("channel-capacity value 3")).toBeInTheDocument();
  });

  it("calls onChange with the numeric value when the slider changes", () => {
    const onChange = vi.fn();
    render(<ExperimentTray experiments={EXPERIMENTS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("channel-capacity value 3"), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith("channel-capacity", 5);
  });

  it("uses default values when experimentState is missing an entry", () => {
    render(<ExperimentTray experiments={EXPERIMENTS} />);
    expect(screen.getByLabelText("worker-count value 1")).toBeInTheDocument();
    expect(screen.getByLabelText("channel-capacity value 3")).toBeInTheDocument();
  });

  it("ignores malformed experiment definitions", () => {
    const { container } = render(<ExperimentTray experiments={[{ id: null }]} />);
    expect(container.querySelector("input")).toBeNull();
  });

  it("does not render unsupported or incomplete experiment definitions", () => {
    const { container } = render(<ExperimentTray experiments={[
      { id: "future-control", kind: "future-kind", min: 0, max: 1, step: 1, default: 0 },
      { id: "missing-step", kind: "bounded-number", min: 0, max: 1, default: 0 }
    ]} />);
    expect(container.querySelector("input")).toBeNull();
  });

  it("does not render untrusted or step-misaligned experiment definitions", () => {
    const { container } = render(<ExperimentTray experiments={[
      { id: "arbitrary-control", kind: "bounded-number", min: 0, max: 2, step: 1, default: 1 },
      { id: "worker-count", kind: "bounded-number", min: 0, max: 5, step: 2, default: 2 }
    ]} />);
    expect(container.querySelector("input")).toBeNull();
  });
});
