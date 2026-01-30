import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve("public");
const files = fs.readdirSync(publicDir);

// Find "single" titles: title-26.json
const singleTitles = new Map(); // id -> { id, kind, file }
for (const f of files) {
  const m = /^title-(\d+)\.json$/i.exec(f);
  if (!m) continue;

  const id = m[1];

  // If this title also has a meta file, we'll treat it as split instead
  singleTitles.set(id, { id, kind: "single", file: f });
}

// Find "split" titles: title-42.meta.json
const splitTitles = new Map(); // id -> { id, kind, meta }
for (const f of files) {
  const m = /^title-(\d+)\.meta\.json$/i.exec(f);
  if (!m) continue;

  const id = m[1];
  splitTitles.set(id, { id, kind: "split", meta: f });
}

// Build final list: prefer split over single when both exist
const allIds = new Set([...singleTitles.keys(), ...splitTitles.keys()]);

const titles = [...allIds]
  .sort((a, b) => Number(a) - Number(b))
  .map((id) => splitTitles.get(id) ?? singleTitles.get(id));

const manifest = {
  version: 1,
  titles,
};

fs.writeFileSync(
  path.join(publicDir, "titles-manifest.json"),
  JSON.stringify(manifest, null, 2)
);

console.log(`Wrote public/titles-manifest.json with ${titles.length} titles`);
