import crypto from "node:crypto";
import defaultFs from "node:fs/promises";
import path from "node:path";

import { validateProfile } from "./profileSchema.js";
import { isValidProfileId } from "../config/options.js";

function assertProfileId(profileId) {
  if (!isValidProfileId(profileId)) {
    throw new Error("Invalid profile ID");
  }
}

function profileSlug(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/g, "");
  return slug || "learner";
}

const MAX_GENERATED_ID_ATTEMPTS = 32;
const GENERATED_ID_BYTES = 8;

export function createProfileStore({ dataDir, fs = defaultFs, now = () => new Date(), randomBytes }) {
  if (!dataDir) throw new Error("dataDir is required");
  const profilesDirectory = path.join(dataDir, "profiles");
  const profilePath = (profileId) => path.join(profilesDirectory, `${profileId}.json`);

  async function get(profileId) {
    assertProfileId(profileId);
    try {
      return JSON.parse(await fs.readFile(profilePath(profileId), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async function list() {
    let entries;
    try {
      entries = await fs.readdir(profilesDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const profileIds = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -5))
      .sort();
    return Promise.all(profileIds.map(get));
  }

  async function generatedId(name) {
    const slug = profileSlug(name);
    const generate = randomBytes ?? ((size) => crypto.randomBytes(size));
    for (let attempt = 0; attempt < MAX_GENERATED_ID_ATTEMPTS; attempt++) {
      const candidate = `${slug}-${(await generate(GENERATED_ID_BYTES)).toString("hex")}`;
      if (await get(candidate) === null) return candidate;
    }
    throw new Error(`Unable to generate a unique profile ID after ${MAX_GENERATED_ID_ATTEMPTS} attempts`);
  }

  async function save(input) {
    if (input?.id !== undefined) assertProfileId(input.id);
    const validation = validateProfile(input);
    if (!validation.ok) {
      const error = new Error("Invalid profile");
      error.errors = validation.errors;
      throw error;
    }

    const existing = input.id ? await get(input.id) : null;
    if (input.id && !existing) throw new Error("Profile not found");
    const timestamp = now().toISOString();
    const profile = {
      id: input.id ?? await generatedId(validation.value.name),
      ...validation.value,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    await fs.mkdir(profilesDirectory, { recursive: true });
    const destination = profilePath(profile.id);
    const temporary = `${destination}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    await fs.rename(temporary, destination);
    return profile;
  }

  return { list, get, save };
}
