const DEFAULT_BACKEND_URL = "http://127.0.0.1:8787";

export const BACKEND_URL = (import.meta.env.VITE_REFRACT_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");

export async function fetchQueueArtifact() {
  const response = await fetch(`${BACKEND_URL}/artifacts/queue`);

  if (!response.ok) {
    throw new Error(response.status === 404 ? "Queue artifact is missing." : "Backend returned an error.");
  }

  return response.json();
}
