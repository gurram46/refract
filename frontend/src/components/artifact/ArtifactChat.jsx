import { useState } from "react";
import { requestTutor } from "../../lib/api.js";
import { buildTutorContext } from "../../lib/productState.js";

export default function ArtifactChat({
  artifact,
  session,
  activeProfile,
  activeTopic,
  onUpdateSession
}) {
  const [messages, setMessages] = useState(() => {
    if (session?.chatMessages && Array.isArray(session.chatMessages)) return [...session.chatMessages];
    return [];
  });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const suggested = Array.isArray(artifact?.chat?.suggestedQuestions)
    ? artifact.chat.suggestedQuestions
    : [];

  function appendMessages(newMsgs) {
    setMessages((prev) => {
      const combined = [...prev, ...newMsgs];
      if (typeof onUpdateSession === "function") {
        onUpdateSession({
          chatMessages: newMsgs,
          recentEvents: newMsgs.map((m) => ({
            type: m.role === "user" ? "chat.user" : "chat.tutor",
            ts: Date.now(),
            payload: { role: m.role }
          }))
        });
      }
      return combined;
    });
  }

  async function submit(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed || pending) return;
    setInput("");
    setPending(true);
    setError(null);

    const userMsg = { role: "user", content: trimmed };
    const currentMessagesBeforeSubmit = messages;
    setMessages((prev) => [...prev, userMsg]);

    const context = buildTutorContext({
      artifact,
      session: {
        ...(session ?? {}),
        chatMessages: [...currentMessagesBeforeSubmit, userMsg],
        recentEvents: Array.isArray(session?.recentEvents) ? session.recentEvents : [],
        traceEvents: Array.isArray(session?.traceEvents) ? session.traceEvents : [],
        code: session?.code ?? null,
        latestRunResult: session?.latestRunResult ?? null,
        currentStep: session?.currentStep ?? null,
        chatSummary: session?.chatSummary ?? null
      },
      activeProfile,
      activeTopic,
      action: "explain",
      question: trimmed,
      tab: "canvas"
    });

    try {
      const reply = await requestTutor("explain", context);
      const content = reply?.message ?? reply?.reply ?? reply?.response ?? reply?.content ?? "No response.";
      const tutorMsg = { role: "tutor", content };
      appendMessages([tutorMsg]);
    } catch (e) {
      const errMsg = { role: "tutor", content: e.message, error: true };
      setError(e.message);
      appendMessages([errMsg]);
    } finally {
      setPending(false);
    }
  }

  function handleQuickAction(question) {
    submit(question);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  return (
    <aside className="artifact-chat" aria-label="Tutor chat">
      <div className="chat-header">
        <p className="eyebrow">Tutor</p>
        <h3>Ask about this artifact</h3>
      </div>

      {suggested.length > 0 ? (
        <div className="chat-quick-actions" aria-label="Quick questions">
          {suggested.map((q, idx) => (
            <button
              key={`q-${idx}`}
              type="button"
              className="chat-quick-btn"
              onClick={() => handleQuickAction(q)}
              disabled={pending}
              aria-label={`Ask: ${q}`}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-history" aria-label="Chat messages" role="log">
        {messages.length === 0 ? (
          <p className="chat-empty">No messages yet. Ask a question or pick one above.</p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={`msg-${idx}`}
              className={`chat-message ${msg.role === "user" ? "chat-user" : "chat-tutor"} ${msg.error ? "chat-error" : ""}`}
            >
              <span className="chat-role">{msg.role === "user" ? "You" : "Tutor"}</span>
              <p className="chat-content">{msg.content}</p>
            </div>
          ))
        )}
      </div>

      {pending ? (
        <div className="chat-pending" aria-live="polite">
          <span className="chat-pending-label">Tutor is responding...</span>
        </div>
      ) : null}

      {error && !pending ? (
        <div className="chat-error-banner" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={pending}
          rows={2}
          aria-label="Type your question"
        />
        <button
          type="button"
          className="chat-send-btn primary-action"
          onClick={() => submit(input)}
          disabled={pending || !input.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </aside>
  );
}