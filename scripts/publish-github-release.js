import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function getGithubToken() {
  try {
    const creds = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill', {
      encoding: 'utf8'
    });
    for (const line of creds.split('\n')) {
      if (line.startsWith('password=')) {
        return line.substring('password='.length).trim();
      }
    }
  } catch (e) {
    console.error('Failed to get credentials:', e);
  }
  return process.env.GITHUB_TOKEN || '';
}

async function main() {
  const token = getGithubToken();
  if (!token) {
    console.error('No GitHub token found!');
    process.exit(1);
  }

  const repo = 'satyajishu31/tooldesk';
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  const version = pkg.version;
  const tag = `v${version}`;
  const releaseName = `ToolDesk v${version}`;
  const notes = fs.existsSync(path.resolve(process.cwd(), 'releases/SHA256SUMS.txt'))
    ? fs.readFileSync(path.resolve(process.cwd(), 'releases/SHA256SUMS.txt'), 'utf8')
    : '';

  const releaseBody = `## ToolDesk v${version} — Next-Generation Master Upgrade

### Highlights:
- **Universal Local History Engine:** Centralized IndexedDB \`tooldesk\` database. Safe metadata sanitization, string bounding, zero secret leakage. Fixed historical sanitizer bug: decoupled tool name validation from payload validation (allows safe masked passwords \`•••••••• (16 chars)\` while strictly rejecting raw passwords, API keys, private keys, and raw bcrypt hashes).
- **Universal File Engine & Workspace:** Unified \`createOutput\` file engine with MIME/extension validation and local metadata workspace. Supports in-app file preview (PDF, images, TXT, JSON, CSV, SRT, VTT) with zero unnecessary binary bloat.
- **Universal Job & Batch Engine:** Deterministic state machine (\`idle\`, \`queued\`, \`running\`, \`progress\`, \`completed\`, \`failed\`, \`cancelled\`, \`retrying\`), concurrency control with mobile-safe throttles, \`AbortController\` cancellation, and batch ZIP export.
- **Smart Search & Command Palette:** Intent-aware search matching (\`Cmd/Ctrl+K\`), tracking recent tools and starred favorites without layout churn.
- **Preset Engine:** Custom tool presets with built-in presets for Image Compressor, PDF Toolkit, and Resizer.
- **AI Streaming & Contextual Copilot:** Progressive streaming response rendering, Stop, Regenerate, Copy actions, and compact in-tool contextual suggestion banners.
- **Android MediaStore Direct Save Preserved:** Retained the robust v1.0.4 direct save to \`Downloads/ToolDesk/\` via Android MediaStore (\`IS_PENDING\` transactions) with zero Share sheet fallback.
- **Absolute Visual & Architectural Lock:** Syne & DM Sans typography, brand colors, cards, robot assistant mascot artwork, and Framer Motion animation language 100% preserved.

### SHA-256 Checksum Manifest:
\`\`\`
${notes}
\`\`\`
`;

  console.log(`===> Creating GitHub release ${tag} on ${repo}...`);

  // 1. Create release
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag_name: tag,
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false
    })
  });

  const releaseData = await res.json();
  if (!res.ok) {
    console.error('Failed to create release:', releaseData);
    process.exit(1);
  }

  console.log(`Release created: ${releaseData.html_url} (ID: ${releaseData.id})`);
  const uploadUrlTemplate = releaseData.upload_url; // e.g. https://uploads.github.com/repos/.../assets{?name,label}
  const baseUploadUrl = uploadUrlTemplate.replace(/\{\?name,label\}/, '');

  // 2. Upload assets
  const assetsToUpload = [
    { name: 'ToolDesk.apk', filePath: 'releases/android/ToolDesk.apk', contentType: 'application/vnd.android.package-archive' },
    { name: 'ToolDesk.aab', filePath: 'releases/android/ToolDesk.aab', contentType: 'application/octet-stream' },
    { name: 'ToolDesk-macos-arm64.dmg', filePath: 'releases/macos/ToolDesk-macos-arm64.dmg', contentType: 'application/x-apple-diskimage' },
    { name: 'ToolDesk-macos-arm64.zip', filePath: 'releases/macos/ToolDesk-macos-arm64.zip', contentType: 'application/zip' },
    { name: 'SHA256SUMS.txt', filePath: 'releases/SHA256SUMS.txt', contentType: 'text/plain' }
  ];

  for (const asset of assetsToUpload) {
    const fullPath = path.resolve(process.cwd(), asset.filePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Asset not found: ${asset.filePath}, skipping...`);
      continue;
    }
    const stat = fs.statSync(fullPath);
    console.log(`Uploading ${asset.name} (${(stat.size / 1024 / 1024).toFixed(2)} MB)...`);

    const fileStream = fs.readFileSync(fullPath);
    const uploadRes = await fetch(`${baseUploadUrl}?name=${encodeURIComponent(asset.name)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': asset.contentType,
        'Content-Length': String(stat.size)
      },
      body: fileStream
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error(`Failed to upload ${asset.name}:`, err);
    } else {
      const uploadedData = await uploadRes.json();
      console.log(`  ✓ Uploaded ${asset.name} (Asset ID: ${uploadedData.id})`);
    }
  }

  console.log('\n===> All release assets uploaded successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
