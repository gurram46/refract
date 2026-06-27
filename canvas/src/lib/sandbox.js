import { buildInjection } from "./injections.js";

export function executeInSandbox({ code, containerEl, blockIndex = 0, onMessage }) {
  if (!containerEl) {
    throw new Error("Missing sandbox container.");
  }

  containerEl.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.title = `Refract canvas block ${blockIndex + 1}`;
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.className = "sandbox-frame";

  const messageHandler = (event) => {
    if (event.source !== iframe.contentWindow) return;
    const message = event.data || {};
    if (message.type === "pngData" && message.dataUrl) {
      downloadPng(message.dataUrl, `refract-block-${blockIndex + 1}.png`);
    }
    if (typeof onMessage === "function") onMessage(message);
  };

  window.addEventListener("message", messageHandler);
  containerEl.appendChild(iframe);
  iframe.srcdoc = buildInjection({ userCode: code });

  const post = (message) => {
    if (iframe.contentWindow) iframe.contentWindow.postMessage(message, "*");
  };

  return {
    iframe,
    play: () => post({ type: "play" }),
    pause: () => post({ type: "pause" }),
    nextStep: () => post({ type: "nextStep" }),
    prevStep: () => post({ type: "prevStep" }),
    setSpeed: (value) => post({ type: "setSpeed", value }),
    exportPNG: () => post({ type: "exportPNG" }),
    destroy: () => {
      window.removeEventListener("message", messageHandler);
      iframe.remove();
    }
  };
}

function downloadPng(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
