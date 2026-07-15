import { spawn } from "node:child_process";

const PYTHON_CANDIDATES = [
  ...(process.env.PYTHON_BIN ? [{ command: process.env.PYTHON_BIN, args: [] }] : []),
  { command: "python", args: [] },
  { command: "py", args: ["-3"] }
];

let cachedPython = null;

export async function detectPython() {
  return Boolean(await resolvePythonCommand());
}

export async function resolvePythonCommand() {
  if (cachedPython) return cachedPython;
  for (const candidate of PYTHON_CANDIDATES) {
    if (await canRun(candidate.command, [...candidate.args, "--version"])) {
      cachedPython = candidate;
      return cachedPython;
    }
  }
  return null;
}

function canRun(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
