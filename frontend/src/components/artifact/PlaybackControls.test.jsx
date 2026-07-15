import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PlaybackControls from "./PlaybackControls.jsx";

const NOOP = () => {};

describe("PlaybackControls", () => {
  it("renders all five playback buttons with accessible labels", () => {
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={1}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    expect(screen.getByRole("button", { name: "Previous step" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next step" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replay from start" })).toBeInTheDocument();
  });

  it("speed selector offers 0.5x, 1x, 2x", () => {
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={1}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    const select = screen.getByLabelText("Playback speed");
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(values).toEqual(["0.5", "1", "2"]);
  });

  it("current speed is selected in the dropdown", () => {
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={2}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    const select = screen.getByLabelText("Playback speed");
    expect(select.value).toBe("2");
  });

  it("Previous disabled at start, Next disabled at end, Play disabled while playing", () => {
    render(
      <PlaybackControls
        hasEvents={true}
        playing={true}
        atStart={true}
        atEnd={true}
        speed={1}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Replay from start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause" })).not.toBeDisabled();
  });

  it("clicking Play calls onPlay", () => {
    const onPlay = vi.fn();
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={1}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={onPlay}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("clicking Next calls onNext", () => {
    const onNext = vi.fn();
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={1}
        onPrevious={NOOP}
        onNext={onNext}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("changing speed calls onSpeedChange with a number", () => {
    const onSpeedChange = vi.fn();
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={1}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={onSpeedChange}
      />
    );
    fireEvent.change(screen.getByLabelText("Playback speed"), { target: { value: "0.5" } });
    expect(onSpeedChange).toHaveBeenCalledWith(0.5);
  });

  it("buttons are reachable via Tab focus (real focusable elements)", async () => {
    render(
      <PlaybackControls
        hasEvents={true}
        playing={false}
        atStart={false}
        atEnd={false}
        speed={1}
        onPrevious={NOOP}
        onNext={NOOP}
        onPlay={NOOP}
        onPause={NOOP}
        onReplay={NOOP}
        onSpeedChange={NOOP}
      />
    );
    const prev = screen.getByRole("button", { name: "Previous step" });
    prev.focus();
    expect(document.activeElement).toBe(prev);
  });
});
