import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { createArtifactCache } from "./artifacts/artifactCache.js";
import { createArtifactGenerator } from "./artifacts/artifactGenerator.js";
import { validateArtifact } from "./artifacts/artifactSchema.js";
import { createProfileStore } from "./profiles/profileStore.js";
import { createTopicGraph } from "./topics/topicGraph.js";
import { createSessionStore } from "./memory/sessionStore.js";
import { createAiProvider, aiStatus } from "./lib/aiProvider.js";
import { createLogger } from "./lib/logger.js";
import { loadEnv } from "./lib/loadEnv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export function composeDefaults() {
  const logger = createLogger();
  const aiProvider = createAiProvider({ logger });
  const dataDir = process.env.REFRACT_BACKEND_DATA_DIR || path.join(repoRoot, "backend", "data");
  const generatedRoot = process.env.REFRACT_GENERATED_ROOT || path.join(repoRoot, "generated");

  const profileStore = createProfileStore({ dataDir });
  const topicGraph = createTopicGraph({ repoRoot, logger });
  const artifactCache = createArtifactCache({ generatedRoot, validator: validateArtifact, logger });
  const artifactGenerator = createArtifactGenerator({ profileStore, topicGraph, artifactCache, aiProvider, logger });
  const sessionStore = createSessionStore({ dataDir });

  return { logger, profileStore, topicGraph, artifactGenerator, sessionStore };
}

const envResult = await loadEnv({ envPath: new URL("../.env", import.meta.url) });
const services = composeDefaults();
services.logger.info("env.loaded", envResult);
services.logger.info("provider.configured", aiStatus());

const PORT = Number(process.env.REFRACT_BACKEND_PORT || 8787);
const app = createApp(services);

app.listen(PORT, "127.0.0.1", () => {
  services.logger.info("server.started", { host: "127.0.0.1", port: PORT });
});