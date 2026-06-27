import { RefractCanvas } from "./RefractCanvas.js";

export const p5CDN = "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js";
export const d3CDN = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js";

function escapeScript(source) {
  return String(source).replace(/<\/script/gi, "<\\/script");
}

export function buildInjection({ userCode }) {
  const refractCanvasSource = RefractCanvas.toString();

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0a0a0a;
        color: #fff;
        font-family: Inter, system-ui, sans-serif;
        overflow: hidden;
      }
      #scale-root {
        width: 100%;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #output {
        position: relative;
        width: var(--refract-width, 600px);
        height: var(--refract-height, 400px);
        transform-origin: top left;
      }
      #refract-canvas,
      #refract-svg {
        position: absolute;
        inset: 0;
        background: #0a0a0a;
      }
      .refract-caption {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 14px;
        text-align: center;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        pointer-events: none;
      }
    </style>
    <script src="${p5CDN}"><\/script>
    <script src="${d3CDN}"><\/script>
  </head>
  <body>
    <div id="scale-root">
      <div id="output">
        <canvas id="refract-canvas"></canvas>
        <svg id="refract-svg"></svg>
      </div>
    </div>
    <script>
      ${refractCanvasSource}
      window.__refractCanvas = null;

      function postError(error) {
        window.parent.postMessage({
          type: "error",
          message: error && error.message ? error.message : String(error),
          stack: error && error.stack ? error.stack : ""
        }, "*");
      }

      function scaleOutput() {
        const output = document.getElementById("output");
        const root = document.getElementById("scale-root");
        const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--refract-width")) || 600;
        const height = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--refract-height")) || 400;
        const scale = Math.min(1, Math.max(0.2, (root.clientWidth - 16) / width));
        output.style.transform = "scale(" + scale + ")";
        root.style.height = Math.ceil(height * scale + 24) + "px";
      }

      window.addEventListener("resize", scaleOutput);
      window.onerror = function(message, source, lineno, colno, error) {
        postError(error || new Error(message));
      };
      window.onunhandledrejection = function(event) {
        postError(event.reason || new Error("Unhandled promise rejection"));
      };
      window.addEventListener("message", function(event) {
        const canvas = window.__refractCanvas;
        if (!canvas) return;
        const message = event.data || {};
        try {
          if (message.type === "play") canvas.play();
          if (message.type === "pause") canvas.pause();
          if (message.type === "nextStep") canvas.nextStep();
          if (message.type === "prevStep") canvas.prevStep();
          if (message.type === "setSpeed") canvas.setSpeed(message.value);
          if (message.type === "exportPNG") canvas.exportPNG();
        } catch (error) {
          postError(error);
        }
      });

      try {
        ${escapeScript(userCode)}
        const canvases = Array.from(document.querySelectorAll("#output canvas"));
        const latestCanvas = canvases[canvases.length - 1];
        if (latestCanvas && latestCanvas.id !== "refract-canvas") {
          document.getElementById("refract-canvas").replaceWith(latestCanvas);
          latestCanvas.id = "refract-canvas";
        }
        scaleOutput();
        window.parent.postMessage({ type: "ready" }, "*");
      } catch (error) {
        postError(error);
      }
    <\/script>
  </body>
</html>`;
}
