import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StrictMode, Suspense, lazy } from "react";
import SceneCodeSnippet from "./SceneCodeSnippet.jsx";

const SNIPPETS = [
  {
    id: "send-loop",
    language: "go",
    file: "main.go",
    code: "for _, job := range jobs {\n    queue <- job\n}",
    editable: false,
    annotations: [{ line: 2, text: "This send waits when the buffer is full." }]
  },
  {
    id: "worker",
    language: "go",
    file: "main.go",
    code: "go worker()",
    editable: false,
    annotations: []
  }
];

describe("SceneCodeSnippet", () => {
  it("renders a keyboard-accessible tablist when multiple snippets exist", () => {
    render(<SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />);
    expect(screen.getByRole("tablist", { name: /code snippets/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /send-loop/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /worker/i })).toBeInTheDocument();
  });

  it("shows the snippet selected by codeRef", () => {
    const { container } = render(
      <SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "worker", lines: [1] }} />
    );
    expect(container.querySelector('[data-snippet-id="worker"]')).toBeInTheDocument();
    expect(container.querySelector('[data-language="go"]')).toBeInTheDocument();
  });

  it("falls back to the first snippet when codeRef is missing", () => {
    const { container } = render(<SceneCodeSnippet snippets={SNIPPETS} />);
    expect(container.querySelector('[data-snippet-id="send-loop"]')).toBeInTheDocument();
    expect(screen.getByText(/No snippet reference provided/)).toBeInTheDocument();
  });

  it("shows a visible diagnostic for a missing snippet id", () => {
    render(<SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "missing", lines: [1] }} />);
    expect(screen.getByText(/Snippet reference missing not found/)).toBeInTheDocument();
  });

  it("shows a visible diagnostic for out-of-range line references", () => {
    render(<SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [9] }} />);
    expect(screen.getByText(/Lines out of range: 9/)).toBeInTheDocument();
  });

  it("renders annotations", () => {
    render(<SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />);
    expect(screen.getByText("This send waits when the buffer is full.")).toBeInTheDocument();
  });

  it("renders a read-only CodeMirror editor without a contenteditable trap", () => {
    const { container } = render(
      <SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
    );
    const editor = container.querySelector(".cm-content");
    expect(editor).toBeInTheDocument();
    expect(editor.getAttribute("contenteditable")).toBe("false");
  });

  it("highlights the active line bound by the current step", () => {
    const { container } = render(
      <SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
    );
    expect(container.querySelector(".cm-snippet-active-line")).toBeInTheDocument();
  });

  it("exposes active line numbers as a data attribute for integration tests", () => {
    const { container } = render(
      <SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
    );
    const root = container.querySelector(".scene-code-snippet");
    expect(root.getAttribute("data-active-lines")).toBe("2");
  });

  it("switches visible snippet via keyboard-operable tabs", () => {
    render(<SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />);
    const workerTab = screen.getByRole("tab", { name: /worker/i });
    fireEvent.click(workerTab);
    expect(screen.getByRole("tab", { name: /worker/i })).toHaveAttribute("aria-selected", "true");
  });

  it("leaves exactly one live CodeMirror editor after StrictMode mount/unmount/remount", () => {
    const { container, rerender } = render(
      <StrictMode>
        <SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
      </StrictMode>
    );
    expect(container.querySelectorAll(".cm-editor").length).toBe(1);
    const content = container.querySelector(".cm-content");
    expect(content).toBeInTheDocument();
    expect(content.getAttribute("contenteditable")).toBe("false");

    rerender(
      <StrictMode>
        <SceneCodeSnippet snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
      </StrictMode>
    );
    expect(container.querySelectorAll(".cm-editor").length).toBe(1);

    rerender(<div />);
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  it("renders via React.lazy and Suspense", async () => {
    const LazyScene = lazy(() => import("./SceneCodeSnippet.jsx"));
    const { container } = render(
      <Suspense fallback={<div className="fallback">Loading</div>}>
        <LazyScene snippets={SNIPPETS} codeRef={{ snippetId: "send-loop", lines: [2] }} />
      </Suspense>
    );
    expect(container.querySelector(".fallback")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector(".scene-code-snippet")).toBeInTheDocument();
    });
  });
});
