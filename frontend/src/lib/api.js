const DEFAULT_BACKEND_URL = "http://127.0.0.1:8787";

const BACKEND_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_REFRACT_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");

function resolveUrl(fetchFn) {
  return (typeof fetchFn === "function" && fetchFn?._backendUrl) || BACKEND_URL;
}

function jsonHeaders(body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  return headers;
}

function safeErrorKind(responseBody = {}) {
  const message = responseBody.error || responseBody.message || responseBody.code || "Unknown error";
  const clean = String(message).replace(/(provider|model|api.?key|schema.?path|stack.?trace)/gi, "[redacted]");
  return clean;
}

export function createApiClient({ fetchFn, baseUrl } = {}) {
  const fetchImpl = fetchFn ?? globalThis.fetch.bind(globalThis);
  const base = baseUrl ?? BACKEND_URL;

  async function doFetch(pathname, method, body) {
    const url = `${base}${pathname}`;
    const init = { method, headers: jsonHeaders(body) };
    if (method !== "GET" && body !== undefined) init.body = JSON.stringify(body);

    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (networkError) {
      const message =
        networkError instanceof TypeError
          ? "Unable to connect to the server. Please check your connection and try again."
          : "Something went wrong. Please try again.";
      throw new Error(message);
    }

    let bodyJson = {};
    try {
      bodyJson = await response.json();
    } catch (_) {
      bodyJson = {};
    }

    const status = response.status;
    if (!response.ok) {
      const msg = safeErrorKind(bodyJson);
      const error = new Error(msg);
      error.status = status;
      if (bodyJson.code) error.code = bodyJson.code;
      throw error;
    }

    return bodyJson;
  }

  function errMessage(fallback, inner) {
    if (!inner || inner === "Unknown error") return fallback;
    return `${fallback} ${inner}`;
  }

  return {
    /** GET /options → { levels, languages, coreDomains, pairedDomains } */
    async getOptions() {
      try { return await doFetch("/options", "GET"); }
      catch (e) { throw new Error(errMessage("Could not load setup options.", e.message)); }
    },

    /** GET /profiles → profile[] */
    async listProfiles() {
      try { return await doFetch("/profiles", "GET"); }
      catch (e) { throw new Error(errMessage("Could not load profiles.", e.message)); }
    },

    /** POST /profiles → created profile */
    async createProfile(body) {
      try { return await doFetch("/profiles", "POST", body); }
      catch (e) { throw new Error(errMessage("Could not save the profile.", e.message)); }
    },

    /** GET /profiles/:profileId → profile */
    async getProfile(profileId) {
      try { return await doFetch(`/profiles/${encodeURIComponent(profileId)}`, "GET"); }
      catch (e) { throw new Error(errMessage("Could not load the profile.", e.message)); }
    },

    /** GET /topics → topic[] */
    async listTopics() {
      try { return await doFetch("/topics", "GET"); }
      catch (e) { throw new Error(errMessage("Could not load topics.", e.message)); }
    },

    /** GET /topics/:topicId → topic */
    async getTopic(topicId) {
      try { return await doFetch(`/topics/${encodeURIComponent(topicId)}`, "GET"); }
      catch (e) { throw new Error(errMessage("Could not load the topic.", e.message)); }
    },

    /** GET /artifact-runtime/:profileId/:topicId
     *  Returns artifact payload or null when not yet generated. */
    async getCachedArtifact(profileId, topicId) {
      try {
        return await doFetch(`/artifact-runtime/${encodeURIComponent(profileId)}/${encodeURIComponent(topicId)}`, "GET");
      } catch (e) {
        if (e.code === "ARTIFACT_NOT_GENERATED") return null;
        throw new Error(errMessage("Could not load the artifact.", e.message));
      }
    },

    /** POST /artifact-runtime/:profileId/:topicId/generate → { status, artifact, ... } */
    async generateArtifact(profileId, topicId) {
      try { return await doFetch(`/artifact-runtime/${encodeURIComponent(profileId)}/${encodeURIComponent(topicId)}/generate`, "POST"); }
      catch (e) { throw new Error(errMessage("Could not generate the artifact.", e.message)); }
    },

    /** GET /artifact-runtime/:profileId/:topicId/completion → { complete, satisfied, missing } */
    async getCompletion(profileId, topicId) {
      try { return await doFetch(`/artifact-runtime/${encodeURIComponent(profileId)}/${encodeURIComponent(topicId)}/completion`, "GET"); }
      catch (e) { throw new Error(errMessage("Could not load completion status.", e.message)); }
    },

    /** GET /sessions/:profileId/:topicId → session */
    async getSession(profileId, topicId) {
      try { return await doFetch(`/sessions/${encodeURIComponent(profileId)}/${encodeURIComponent(topicId)}`, "GET"); }
      catch (e) { throw new Error(errMessage("Could not load session.", e.message)); }
    },

    /** POST /sessions/:profileId/:topicId → updated session */
    async updateSession(profileId, topicId, patch) {
      try { return await doFetch(`/sessions/${encodeURIComponent(profileId)}/${encodeURIComponent(topicId)}`, "POST", patch); }
      catch (e) { throw new Error(errMessage("Could not update session.", e.message)); }
    },

    /** POST /run → { success, artifactId, language, stdout, stderr, traceEvents, summary }
     *  body: { profileId, topicId, language, code } for generated artifacts
     *  body: { artifactId, language, code } for legacy pack artifacts */
    async runCode(profileIdOrArtifactId, topicId, language, code) {
      if (!code || typeof code !== "string") code = "";
      const body = typeof topicId === "string" && /^[a-z][a-z0-9_.-]*\.[a-z][a-z0-9_.-]*$/.test(String(topicId))
        ? { profileId: profileIdOrArtifactId, topicId, language, code }
        : { artifactId: profileIdOrArtifactId, language, code };
      try { return await doFetch("/run", "POST", body); }
      catch (e) { throw new Error(errMessage("Could not run the code.", e.message)); }
    },

    /** POST /ai/stream/:kind → tutor reply. kind ∈ explain|hint|evaluate */
    async requestTutor(kind, body) {
      try { return await doFetch(`/ai/stream/${encodeURIComponent(kind)}`, "POST", body); }
      catch (e) { throw new Error(errMessage("Could not get a tutor response.", e.message)); }
    },

    /** GET /artifacts/:id → loaded artifact */
    async loadArtifact(artifactId) {
      try { return await doFetch(`/artifacts/${encodeURIComponent(artifactId)}`, "GET"); }
      catch (e) { throw new Error(errMessage("Could not load the artifact.", e.message)); }
    }
  };
}

const defaultApi = createApiClient();

async function fetchQueueArtifact() {
  return defaultApi.loadArtifact("queue");
}

export {
  fetchQueueArtifact
};

export const {
  getOptions,
  listProfiles,
  createProfile,
  getProfile,
  listTopics,
  getTopic,
  getCachedArtifact,
  generateArtifact,
  getCompletion,
  getSession,
  updateSession,
  runCode,
  requestTutor
} = defaultApi;