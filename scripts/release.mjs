import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return pkg.version;
}

function bumpVersion(version, type) {
  const parts = version.split(".").map(Number);
  if (type === "patch") parts[2]++;
  if (type === "minor") {
    parts[1]++;
    parts[2] = 0;
  }
  if (type === "major") {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  }
  return parts.join(".");
}

function updateFile(filePath, version, type) {
  let content = fs.readFileSync(filePath, "utf8");
  if (type === "json") {
    const json = JSON.parse(content);
    json.version = version;
    content = JSON.stringify(json, null, 2) + "\n"; // Keep newline at end
  } else if (type === "toml") {
    // Simple regex replacement for Cargo.toml to avoid parsing TOML
    // Matches version = "x.y.z" inside [package] section roughly
    // We assume the first version = "..." is the package version
    content = content.replace(/^version = "[^"]+"/m, `version = "${version}"`);
  }
  fs.writeFileSync(filePath, content);
}

async function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  try {
    const currentVersion = getCurrentVersion();
    console.log(`Current version: ${currentVersion}`);

    const patch = bumpVersion(currentVersion, "patch");
    const minor = bumpVersion(currentVersion, "minor");
    const major = bumpVersion(currentVersion, "major");

    console.log(`1. Patch (${patch})`);
    console.log(`2. Minor (${minor})`);
    console.log(`3. Major (${major})`);
    console.log(`4. Custom`);

    const choice = await prompt("Select release type (1-4): ");
    let newVersion = "";

    switch (choice.trim()) {
      case "1":
        newVersion = patch;
        break;
      case "2":
        newVersion = minor;
        break;
      case "3":
        newVersion = major;
        break;
      case "4":
        newVersion = await prompt("Enter custom version: ");
        break;
      default:
        console.log("Invalid choice");
        process.exit(1);
    }

    if (!newVersion) {
      console.log("Invalid version");
      process.exit(1);
    }

    const confirm = await prompt(`Releasing v${newVersion}. Confirm? (y/n): `);
    if (confirm.toLowerCase() !== "y") {
      console.log("Aborted");
      process.exit(0);
    }

    console.log("Updating files...");
    updateFile(packageJsonPath, newVersion, "json");
    updateFile(tauriConfPath, newVersion, "json");
    updateFile(cargoTomlPath, newVersion, "toml");

    console.log("Committing changes...");
    try {
      execSync(
        `git add "${packageJsonPath}" "${tauriConfPath}" "${cargoTomlPath}"`,
        { stdio: "inherit" }
      );
      execSync(`git commit -m "chore: release v${newVersion}"`, {
        stdio: "inherit",
      });
      execSync(`git tag v${newVersion}`, { stdio: "inherit" });

      const push = await prompt("Push changes and tag? (y/n): ");
      if (push.toLowerCase() === "y") {
        execSync("git push && git push --tags", { stdio: "inherit" });
        console.log("Released successfully!");
      } else {
        console.log("Changes committed and tagged locally. Remember to push!");
      }
    } catch (e) {
      console.error("Git operation failed:", e.message);
    }
  } catch (error) {
    console.error(error);
  } finally {
    rl.close();
  }
}

main();
