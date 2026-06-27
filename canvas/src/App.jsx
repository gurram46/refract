import { useMemo, useState } from "react";
import CanvasPanel from "./components/CanvasPanel.jsx";
import InputPanel from "./components/InputPanel.jsx";
import { modelOutputExamples } from "./lib/examples.js";
import { parseBlocks } from "./lib/blockParser.js";

export default function App() {
  const [input, setInput] = useState(modelOutputExamples[0].text);
  const [renderedInput, setRenderedInput] = useState(modelOutputExamples[0].text);

  const parsed = useMemo(() => parseBlocks(renderedInput), [renderedInput]);

  return (
    <main className="app-shell">
      <InputPanel value={input} onChange={setInput} onRender={() => setRenderedInput(input)} />
      <CanvasPanel blocks={parsed.blocks} parseErrors={parsed.errors} />
    </main>
  );
}
