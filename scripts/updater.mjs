/* eslint-disable no-undef */
import { getOctokit, context } from "@actions/github";
import fs from "fs";

const token = process.env.GITHUB_TOKEN;

async function updater() {
  if (!token) {
    console.log("GITHUB_TOKEN is required");
    process.exit(1);
  }

  const options = { owner: context.repo.owner, repo: context.repo.repo };
  const github = getOctokit(token);

  // 1. Get the tag name
  let tagName = "";
  if (context.ref && context.ref.startsWith("refs/tags/")) {
    tagName = context.ref.replace("refs/tags/", "");
  } else {
    // Fallback to finding the latest tag
    const { data: tags } = await github.rest.repos.listTags({
      ...options,
      per_page: 1,
    });
    const tag = tags.find((t) => t.name.startsWith("v"));
    if (!tag) {
      console.log("No tag found");
      return;
    }
    tagName = tag.name;
  }

  console.log(`Processing tag: ${tagName}`);

  // 2. Get the release by tag
  let release;
  try {
    console.log(`Attempting to fetch release for tag: ${tagName}`);
    const { data } = await github.rest.repos.getReleaseByTag({
      ...options,
      tag: tagName,
    });
    release = data;
  } catch (e) {
    console.log(
      `Could not get release by tag ${tagName} (status: ${e.status}). It might be a draft.`
    );
    try {
      // Fallback: List releases (includes drafts for authenticated users)
      const { data: releases } = await github.rest.repos.listReleases({
        ...options,
        per_page: 20,
      });

      release = releases.find((r) => r.tag_name === tagName);

      if (!release) {
        console.error(`Error: Release for tag ${tagName} not found in list.`);
        process.exit(1);
      }
      console.log(`Found release via listReleases: ${release.id}`);
    } catch (listError) {
      console.error("Error listing releases:", listError);
      process.exit(1);
    }
  }

  // 3. Construct latest.json structure
  const version = tagName.replace(/^v/, "");
  const latestJson = {
    version: version,
    notes: release.body, // Use release body as notes
    pub_date:
      release.published_at || release.created_at || new Date().toISOString(),
    platforms: {},
  };

  // 4. Iterate through assets to find signatures and bundles
  const assets = release.assets;
  const sigAssets = assets.filter((a) => a.name.endsWith(".sig"));

  for (const sigAsset of sigAssets) {
    // Download signature content
    const sigData = await github.request(
      "GET /repos/{owner}/{repo}/releases/assets/{asset_id}",
      {
        ...options,
        asset_id: sigAsset.id,
        headers: {
          accept: "application/octet-stream",
        },
      }
    );
    const signature = Buffer.from(sigData.data).toString("utf-8");

    // Find corresponding bundle
    // Naming convention: <name>_<version>_<target>.<ext>.sig
    // We need to map the signature file to the bundle file.
    const bundleName = sigAsset.name.replace(".sig", "");
    const bundleAsset = assets.find((a) => a.name === bundleName);

    if (!bundleAsset) {
      console.warn(`No bundle found for signature: ${sigAsset.name}`);
      continue;
    }

    // Determine platform key
    let platformKey = "";
    if (bundleName.includes("aarch64-apple-darwin")) {
      platformKey = "darwin-aarch64";
    } else if (bundleName.includes("x86_64-apple-darwin")) {
      platformKey = "darwin-x86_64";
    } else if (
      bundleName.includes("x86_64-unknown-linux-gnu") ||
      bundleName.endsWith(".AppImage.tar.gz")
    ) {
      platformKey = "linux-x86_64";
    } else if (
      bundleName.includes("x86_64-pc-windows-msvc") ||
      bundleName.endsWith(".nsis.zip") ||
      bundleName.endsWith(".msi.zip")
    ) {
      platformKey = "windows-x86_64";
    }

    if (platformKey) {
      latestJson.platforms[platformKey] = {
        signature: signature,
        url: bundleAsset.browser_download_url,
      };
    } else {
      console.warn(`Could not determine platform for ${bundleName}`);
    }
  }

  console.log("Generated latest.json:", JSON.stringify(latestJson, null, 2));

  // 5. Write to file
  if (!fs.existsSync("updater")) {
    fs.mkdirSync("updater");
  }
  fs.writeFileSync(
    "./updater/latest.json",
    JSON.stringify(latestJson, null, 2)
  );
  console.log("Saved to updater/latest.json");

  // 6. Upload to release
  // Check if latest.json already exists in assets
  const existingLatestJson = assets.find((a) => a.name === "latest.json");
  if (existingLatestJson) {
    console.log("Deleting existing latest.json...");
    await github.rest.repos.deleteReleaseAsset({
      ...options,
      asset_id: existingLatestJson.id,
    });
  }

  console.log("Uploading new latest.json...");
  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: release.id,
    name: "latest.json",
    data: JSON.stringify(latestJson, null, 2),
  });
}

updater().catch(console.error);
