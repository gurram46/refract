import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(__dirname, "../../data");
const dataDir = process.env.REFRACT_BACKEND_DATA_DIR || defaultDataDir;

export async function getProgress(studentId) {
  const safeId = normalizeStudentId(studentId);
  const stored = await readProgressFile(safeId);
  return stored || emptyProgress(safeId);
}

export async function saveProgress(studentId, event) {
  const safeId = normalizeStudentId(studentId);
  const current = await getProgress(safeId);
  const next = { ...current, lastArtifactId: event.artifactId || current.lastArtifactId || null };

  if (event.event === "artifact_completed" && event.artifactId) {
    const completedAt = event.timestamp || new Date().toISOString();
    const record = {
      artifactId: event.artifactId,
      language: event.language || "python",
      completedAt
    };
    const existingIndex = next.completedArtifacts.findIndex(
      (item) => item.artifactId === record.artifactId && item.language === record.language
    );
    if (existingIndex >= 0) {
      next.completedArtifacts[existingIndex] = record;
    } else {
      next.completedArtifacts.push(record);
    }
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(progressPath(safeId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function emptyProgress(studentId) {
  return {
    studentId,
    completedArtifacts: [],
    lastArtifactId: null
  };
}

async function readProgressFile(studentId) {
  try {
    return JSON.parse(await readFile(progressPath(studentId), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function progressPath(studentId) {
  return path.join(dataDir, `${studentId}.json`);
}

function normalizeStudentId(studentId) {
  const value = String(studentId || "local-student");
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : "local-student";
}
