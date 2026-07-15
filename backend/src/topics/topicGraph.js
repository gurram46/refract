import defaultFs from "node:fs/promises";
import path from "node:path";

import { CORE_DOMAINS, isValidTopicId, PAIRED_DOMAINS, SUPPORTED_LANGUAGES } from "../config/options.js";

const SUPPORTED_DOMAINS = new Set([...CORE_DOMAINS, ...PAIRED_DOMAINS]);

function assertContained(repoRoot, candidate, label) {
  const relative = path.relative(repoRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the repository root`);
  }
}

function resolveSafePath(repoRoot, candidate, label) {
  if (typeof candidate !== "string" || !candidate || path.isAbsolute(candidate)) {
    throw new Error(`${label} must be a repository-relative path`);
  }
  const resolved = path.resolve(repoRoot, candidate);
  assertContained(repoRoot, resolved, label);
  return resolved;
}

function validateNode(node, seenIds, repoRoot) {
  if (!node || typeof node !== "object" || !isValidTopicId(node.id)) {
    throw new Error("Graph node has an invalid ID");
  }
  if (seenIds.has(node.id)) throw new Error(`Duplicate graph node ID: ${node.id}`);
  seenIds.add(node.id);
  if (typeof node.title !== "string" || !node.title.trim()) throw new Error(`Graph node ${node.id} has no title`);
  if (!SUPPORTED_DOMAINS.has(node.domain)) throw new Error(`Graph node ${node.id} has an unsupported domain`);
  resolveSafePath(repoRoot, node.source, `Source for ${node.id}`);
  if (!Array.isArray(node.allowedVisualKinds) || node.allowedVisualKinds.some((kind) => typeof kind !== "string")) {
    throw new Error(`Graph node ${node.id} has invalid visual kinds`);
  }
  if (!Array.isArray(node.connections) || node.connections.some((id) => !isValidTopicId(id))) {
    throw new Error(`Graph node ${node.id} has invalid connections`);
  }
}

function projectNode(node) {
  return {
    id: node.id,
    title: node.title,
    domain: node.domain,
    source: node.source,
    allowedVisualKinds: [...node.allowedVisualKinds],
    connections: [...node.connections]
  };
}

function isLanguageMatch(node, profile) {
  const segments = node.source.replaceAll("\\", "/").split("/");
  return node.domain === "language" && segments[0] === "languages" && segments[1] === profile.language;
}

function isSelectedPairing(node, profile) {
  if (node.domain === "language") {
    return profile.pairedDomains?.includes("language") && isLanguageMatch(node, profile);
  }
  if (!profile.pairedDomains?.includes(node.domain)) return false;
  const segments = node.source.replaceAll("\\", "/").split("/");
  if (segments[0] === node.domain && SUPPORTED_LANGUAGES.includes(segments[1])) {
    return segments[1] === profile.language;
  }
  return true;
}

export function createTopicGraph({ repoRoot, graphPath = "curriculum/topic-graph.json", fs = defaultFs, logger = {} }) {
  if (!repoRoot) throw new Error("repoRoot is required");
  const absoluteRepoRoot = path.resolve(repoRoot);
  const relativeGraphPath = path.isAbsolute(graphPath) ? path.relative(absoluteRepoRoot, graphPath) : graphPath;
  const absoluteGraphPath = resolveSafePath(absoluteRepoRoot, relativeGraphPath, "Graph path");
  let loadPromise;

  async function canonicalPath(candidate, canonicalRepoRoot, label, allowMissing = false) {
    try {
      const canonicalCandidate = await fs.realpath(candidate);
      assertContained(canonicalRepoRoot, canonicalCandidate, label);
      return canonicalCandidate;
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async function readAndValidateGraph() {
    const canonicalRepoRoot = await fs.realpath(absoluteRepoRoot);
    const canonicalGraphPath = await canonicalPath(absoluteGraphPath, canonicalRepoRoot, "Graph path");
    const manifest = JSON.parse(await fs.readFile(canonicalGraphPath, "utf8"));
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.nodes)) {
      throw new Error("Unsupported topic graph schema");
    }
    const seenIds = new Set();
    for (const node of manifest.nodes) validateNode(node, seenIds, absoluteRepoRoot);
    for (const node of manifest.nodes) {
      for (const connectionId of node.connections) {
        if (!seenIds.has(connectionId)) throw new Error(`Unknown graph connection: ${connectionId}`);
      }
    }
    await Promise.all(manifest.nodes.map((node) => {
      const sourcePath = resolveSafePath(absoluteRepoRoot, node.source, `Source for ${node.id}`);
      return canonicalPath(sourcePath, canonicalRepoRoot, `Source for ${node.id}`, true);
    }));
    const nodes = manifest.nodes.map(projectNode);
    return {
      schemaVersion: manifest.schemaVersion,
      canonicalRepoRoot,
      nodes,
      byId: new Map(nodes.map((node) => [node.id, node]))
    };
  }

  function load() {
    loadPromise ??= readAndValidateGraph();
    return loadPromise;
  }

  async function list() {
    const graph = await load();
    return graph.nodes.map((node) => ({ ...node, allowedVisualKinds: [...node.allowedVisualKinds], connections: [...node.connections] }));
  }

  async function get(topicId) {
    if (!isValidTopicId(topicId)) throw new Error("Invalid topic ID");
    const graph = await load();
    return graph.byId.get(topicId) ?? null;
  }

  async function withSourceText(node, required, canonicalRepoRoot) {
    try {
      const sourcePath = resolveSafePath(absoluteRepoRoot, node.source, `Source for ${node.id}`);
      const canonicalSourcePath = await canonicalPath(sourcePath, canonicalRepoRoot, `Source for ${node.id}`);
      return { ...node, sourceText: await fs.readFile(canonicalSourcePath, "utf8") };
    } catch (error) {
      if (error?.code !== "ENOENT" || required) throw error;
      logger.warn?.("topic_source.missing", { topicId: node.id, source: node.source });
      return { ...node };
    }
  }

  async function resolveContext(topicId, profile) {
    if (!isValidTopicId(topicId)) throw new Error("Invalid topic ID");
    const graph = await load();
    const primaryNode = graph.byId.get(topicId);
    if (!primaryNode) throw new Error(`Unknown topic: ${topicId}`);
    const coreNodes = [];
    const pairedNodes = [];
    const adjacent = [];
    for (const connectionId of primaryNode.connections) {
      const node = graph.byId.get(connectionId);
      if (CORE_DOMAINS.includes(node.domain)) coreNodes.push(node);
      else if (isSelectedPairing(node, profile)) pairedNodes.push(node);
      else adjacent.push({ ...node });
    }
    return {
      primary: await withSourceText(primaryNode, true, graph.canonicalRepoRoot),
      core: await Promise.all(coreNodes.map((node) => withSourceText(node, false, graph.canonicalRepoRoot))),
      paired: await Promise.all(pairedNodes.map((node) => withSourceText(node, false, graph.canonicalRepoRoot))),
      adjacent
    };
  }

  return { load, list, get, resolveContext };
}
