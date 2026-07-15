export default function StatusPanel({ message }) {
  if (!message) return null;

  const isError = message.toLowerCase().includes("could not") ||
    message.toLowerCase().includes("unable to") ||
    message.toLowerCase().includes("something went wrong");

  return (
    <div
      className={`status-panel ${isError ? "status-error" : "status-info"}`}
      role={isError ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="status-icon" aria-hidden="true">{isError ? "!" : "i"}</span>
      <span className="status-text">{message}</span>
    </div>
  );
}