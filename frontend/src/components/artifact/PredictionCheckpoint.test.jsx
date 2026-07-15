import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PredictionCheckpoint from "./PredictionCheckpoint.jsx";

const CHECKPOINT = {
  kind: "prediction",
  question: "What lets the producer continue?",
  options: [
    { id: "receive", label: "A worker receives a job" },
    { id: "time", label: "Time passes automatically" }
  ],
  answer: "receive",
  explanation: "Receiving frees one channel slot."
};

describe("PredictionCheckpoint", () => {
  it("renders the question and options", () => {
    render(<PredictionCheckpoint checkpoint={CHECKPOINT} stepId="send-blocks" />);
    expect(screen.getByText("What lets the producer continue?")).toBeInTheDocument();
    expect(screen.getByLabelText("A worker receives a job")).toBeInTheDocument();
    expect(screen.getByLabelText("Time passes automatically")).toBeInTheDocument();
  });

  it("returns null when there is no checkpoint", () => {
    const { container } = render(<PredictionCheckpoint stepId="send-blocks" />);
    expect(container.firstChild).toBeNull();
  });

  it("can transition from no checkpoint to a checkpoint", () => {
    const { rerender } = render(<PredictionCheckpoint stepId="send-blocks" />);
    expect(() => rerender(<PredictionCheckpoint checkpoint={CHECKPOINT} stepId="send-blocks" />)).not.toThrow();
    expect(screen.getByText("What lets the producer continue?")).toBeInTheDocument();
  });

  it("calls onSelectOption when an option is selected", () => {
    const onSelectOption = vi.fn();
    render(
      <PredictionCheckpoint
        checkpoint={CHECKPOINT}
        stepId="send-blocks"
        onSelectOption={onSelectOption}
      />
    );
    fireEvent.click(screen.getByLabelText("A worker receives a job"));
    expect(onSelectOption).toHaveBeenCalledWith("receive");
  });

  it("calls onSubmitAnswer when the form is submitted", () => {
    const onSubmitAnswer = vi.fn();
    render(
      <PredictionCheckpoint
        checkpoint={CHECKPOINT}
        stepId="send-blocks"
        selectedOptionId="receive"
        onSubmitAnswer={onSubmitAnswer}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(onSubmitAnswer).toHaveBeenCalled();
  });

  it("shows the explanation and disables inputs when answered", () => {
    render(<PredictionCheckpoint checkpoint={CHECKPOINT} stepId="send-blocks" answered />);
    expect(screen.getByText("Receiving frees one channel slot.")).toBeInTheDocument();
    expect(screen.getByLabelText("A worker receives a job")).toBeDisabled();
  });

  it("disables inputs and shows pending state while status is pending", () => {
    render(
      <PredictionCheckpoint
        checkpoint={CHECKPOINT}
        stepId="send-blocks"
        status="pending"
        selectedOptionId="receive"
      />
    );
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    expect(screen.getByLabelText("A worker receives a job")).toBeDisabled();
  });

  it("shows an error message when status is error", () => {
    render(
      <PredictionCheckpoint
        checkpoint={CHECKPOINT}
        stepId="send-blocks"
        status="error"
        errorMessage="Could not save answer."
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save answer.");
  });
});
