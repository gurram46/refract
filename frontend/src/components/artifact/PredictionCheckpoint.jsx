import { useId } from "react";

export default function PredictionCheckpoint({
  checkpoint,
  stepId,
  sceneId,
  answered = false,
  selectedOptionId = null,
  status = "idle",
  errorMessage = "",
  onSelectOption,
  onSubmitAnswer
}) {
  const groupName = useId();
  if (!checkpoint || typeof checkpoint !== "object") return null;

  const question = checkpoint.question;
  const options = Array.isArray(checkpoint.options) ? checkpoint.options : [];
  const explanation = checkpoint.explanation;
  const isPending = status === "pending";
  const isError = status === "error";
  const isSuccess = status === "success" || answered;

  function handleSubmit(e) {
    e.preventDefault();
    if (isPending || isSuccess || selectedOptionId == null) return;
    if (typeof onSubmitAnswer === "function") onSubmitAnswer();
  }

  return (
    <form className="prediction-checkpoint" onSubmit={handleSubmit} aria-label="Prediction checkpoint">
      <fieldset className="prediction-fieldset">
        <legend className="prediction-question">{question || "Prediction"}</legend>
        <div className="prediction-options" role="radiogroup" aria-required="true">
          {options.map((option) => {
            const optionId = option?.id ?? String(option);
            const label = option?.label ?? optionId;
            const checked = selectedOptionId === optionId;
            return (
              <label
                key={optionId}
                className={`prediction-option ${checked ? "prediction-option-selected" : ""}`}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={optionId}
                  checked={checked}
                  onChange={() => {
                    if (typeof onSelectOption === "function") onSelectOption(optionId);
                  }}
                  disabled={isPending || isSuccess}
                  aria-label={label}
                />
                <span className="prediction-option-label">{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!answered && (
        <button
          type="submit"
          className="prediction-submit primary-action"
          disabled={isPending || selectedOptionId == null}
          aria-busy={isPending ? "true" : undefined}
        >
          {isPending ? "Submitting…" : "Submit answer"}
        </button>
      )}

      {isSuccess && explanation ? (
        <p className="prediction-explanation" role="status">
          {explanation}
        </p>
      ) : null}

      {isError && errorMessage ? (
        <p className="prediction-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
