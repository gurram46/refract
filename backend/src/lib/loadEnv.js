import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadEnv({
  env = process.env,
  envPath = path.resolve(".env"),
  fs = { readFile }
} = {}) {
  let contents;
  try {
    contents = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { loaded: false, configuredKeys: [] };
    }
    throw error;
  }

  const parsedKeys = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    if (!Object.hasOwn(env, key)) {
      env[key] = line.slice(separator + 1).trim();
    }
    parsedKeys.push(key);
  }

  const configuredKeys = [...new Set(parsedKeys)]
    .filter((key) => typeof env[key] === "string" && env[key].length > 0)
    .sort();

  return { loaded: true, configuredKeys };
}
