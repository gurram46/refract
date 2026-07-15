import { createElement } from "react";

function PlaybackButton({ className, label, onClick, disabled, children }) {
  return createElement(
    "button",
    {
      type: "button",
      className: `playback-btn ${className}`,
      onClick,
      disabled,
      "aria-label": label,
      "aria-disabled": disabled ? "true" : undefined
    },
    createElement("span", { className: "playback-btn-shape", "aria-hidden": "true" }, children.shape),
    createElement("span", { className: "playback-btn-label" }, children.text)
  );
}

export default function PlaybackControls({
  hasEvents,
  playing,
  atStart,
  atEnd,
  speed,
  speeds = [0.5, 1, 2],
  onPrevious,
  onNext,
  onPlay,
  onPause,
  onReplay,
  onSpeedChange
}) {
  const playDisabled = !hasEvents || playing;
  const pauseDisabled = !playing;
  const prevDisabled = !hasEvents || atStart;
  const nextDisabled = !hasEvents || atEnd;
  const replayDisabled = !hasEvents || playing;

  return createElement(
    "div",
    { className: "playback-controls", role: "toolbar", "aria-label": "Playback controls" },
    createElement(
      "div",
      { className: "playback-buttons" },
      createElement(PlaybackButton, {
        className: "playback-prev",
        label: "Previous step",
        onClick: onPrevious,
        disabled: prevDisabled,
        children: { shape: "◀", text: "Previous" }
      }),
      createElement(PlaybackButton, {
        className: "playback-play",
        label: "Play",
        onClick: onPlay,
        disabled: playDisabled,
        children: { shape: "▶", text: "Play" }
      }),
      createElement(PlaybackButton, {
        className: "playback-pause",
        label: "Pause",
        onClick: onPause,
        disabled: pauseDisabled,
        children: { shape: "❚❚", text: "Pause" }
      }),
      createElement(PlaybackButton, {
        className: "playback-next",
        label: "Next step",
        onClick: onNext,
        disabled: nextDisabled,
        children: { shape: "▶|", text: "Next" }
      }),
      createElement(PlaybackButton, {
        className: "playback-replay",
        label: "Replay from start",
        onClick: onReplay,
        disabled: replayDisabled,
        children: { shape: "↺", text: "Replay" }
      })
    ),
    createElement(
      "label",
      { className: "playback-speed" },
      createElement("span", { className: "playback-speed-label" }, "Speed"),
      createElement(
        "select",
        {
          className: "playback-speed-select",
          "aria-label": "Playback speed",
          value: String(speed),
          onChange: (e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && typeof onSpeedChange === "function") onSpeedChange(n);
          }
        },
        speeds.map((s) =>
          createElement(
            "option",
            { key: `speed-${s}`, value: String(s) },
            `${s}x`
          )
        )
      )
    )
  );
}
