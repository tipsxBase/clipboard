import fs from "fs";
import path from "path";

const inputDir = process.argv[2] || ".";
const outputFile = process.argv[3] || "latest.json";

console.log(`Looking for JSON files in ${inputDir}...`);

if (!fs.existsSync(inputDir)) {
  console.error(`Directory ${inputDir} does not exist.`);
  process.exit(1);
}

const files = fs
  .readdirSync(inputDir)
  .filter((f) => f.endsWith(".json") && f.startsWith("latest-"));
console.log(`Found ${files.length} files:`, files);

let merged = null;

files.forEach((file) => {
  const filePath = path.join(inputDir, file);
  try {
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    console.log(`Processing ${file}...`);

    if (!merged) {
      // Initialize with the first file's metadata
      merged = {
        version: content.version,
        notes: content.notes,
        pub_date: content.pub_date,
        platforms: {},
      };
    }

    if (content.platforms) {
      Object.assign(merged.platforms, content.platforms);
    }
  } catch (e) {
    console.error(`Error reading ${file}:`, e);
  }
});

if (merged) {
  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));
  console.log(
    `Successfully merged ${
      Object.keys(merged.platforms).length
    } platforms into ${outputFile}`
  );
} else {
  console.error("No valid latest.json files found to merge.");
  process.exit(1);
}
