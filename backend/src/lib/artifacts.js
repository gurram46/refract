import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const packsRoot = path.join(repoRoot, "packs");

export async function loadArtifact(id) {
  const safeId = normalizeArtifactId(id);
  if (!safeId || safeId !== "queue") {
    const error = new Error("Artifact not found");
    error.status = 404;
    throw error;
  }

  const artifactPath = path.join(packsRoot, "dsa-sd-gt", `${safeId}.json`);
  let artifact;
  try {
    artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      const notFound = new Error("Artifact not found");
      notFound.status = 404;
      throw notFound;
    }
    throw error;
  }

  if (artifact.schemaVersion !== 1) {
    const error = new Error("Unsupported artifact schemaVersion. Expected 1.");
    error.status = 500;
    throw error;
  }

  return artifact;
}

function normalizeArtifactId(id) {
  const value = String(id || "");
  return /^[a-z0-9_-]+$/.test(value) ? value : "";
}
