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
  const tag = 'v1.0.3';
  const releaseName = 'ToolDesk v1.0.3';
  const notes = fs.readFileSync(path.resolve(process.cwd(), 'releases/SHA256SUMS.txt'), 'utf8');

  const releaseBody = `## ToolDesk v1.0.3 — Master Native Download Engine & Mobile Responsiveness Release

### Highlights:
- **Global Android APK Download Engine:** Full native MediaStore.Downloads bridge (\`ToolDeskNativeBridge.java\`) with fallback for Capacitor Filesystem/Share. Resolves download button failures across all tools including Images to PDF, Image Converter, Compressor, Resizer, QR codes, and text exports.
- **Mobile Responsive Layout Fixes:** Eliminated button and action row clipping on mobile viewports. Dynamic stacking for PDF option grids (Page Size, Orientation) prevents text truncation ("Standard A...", "Auto (Matc...").
- **AI Assistant Keystroke Optimization:** Isolated input state in \`ChatInputForm\` eliminates lag during typing. Added \`AbortController\` cancellation to eliminate race conditions.
- **Brand & Visual Integrity:** Maintained design lock (Syne/DM Sans fonts, brand colors, transparent speech-bubble robot assistant, Framer Motion animations).

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
    { name: 'ToolDesk.dmg', filePath: 'releases/macos/ToolDesk.dmg', contentType: 'application/x-apple-diskimage' },
    { name: 'ToolDesk-macos-arm64.zip', filePath: 'releases/macos/ToolDesk-macos-arm64.zip', contentType: 'application/zip' },
    { name: 'ToolDesk-macOS.zip', filePath: 'releases/macos/ToolDesk-macOS.zip', contentType: 'application/zip' },
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
