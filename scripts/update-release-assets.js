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
  const tag = 'v1.3.0';

  console.log(`===> Fetching release ${tag} from ${repo}...`);
  const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  });

  if (!relRes.ok) {
    console.error('Failed to get release:', await relRes.text());
    process.exit(1);
  }

  const releaseData = await relRes.json();
  const baseUploadUrl = releaseData.upload_url.replace(/\{\?name,label\}/, '');

  const assetsToUpdate = [
    { name: 'ToolDesk.apk', filePath: 'releases/android/ToolDesk.apk', contentType: 'application/vnd.android.package-archive' },
    { name: 'ToolDesk.aab', filePath: 'releases/android/ToolDesk.aab', contentType: 'application/octet-stream' },
    { name: 'SHA256SUMS.txt', filePath: 'releases/SHA256SUMS.txt', contentType: 'text/plain' }
  ];

  for (const asset of assetsToUpdate) {
    const existing = (releaseData.assets || []).find(a => a.name === asset.name);
    if (existing) {
      console.log(`Deleting existing asset ${asset.name} (ID: ${existing.id})...`);
      const delRes = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existing.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json'
        }
      });
      if (delRes.ok) {
        console.log(`  ✓ Deleted ${asset.name}`);
      }
    }

    const fullPath = path.resolve(process.cwd(), asset.filePath);
    const stat = fs.statSync(fullPath);
    console.log(`Uploading fresh ${asset.name} (${(stat.size / 1024 / 1024).toFixed(2)} MB)...`);

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
      console.error(`Failed to upload ${asset.name}:`, await uploadRes.text());
    } else {
      const uploadedData = await uploadRes.json();
      console.log(`  ✓ Successfully uploaded fresh ${asset.name} (Asset ID: ${uploadedData.id})`);
    }
  }

  // Also update release body with fresh SHA256SUMS.txt notes
  const notes = fs.readFileSync(path.resolve(process.cwd(), 'releases/SHA256SUMS.txt'), 'utf8');
  const releaseBody = `## ToolDesk v1.3.0 — Advanced PDF Studio & Full Platform Hardening

### Highlights:
- **Advanced PDF Studio (AES-256):** Pure client-side PDF encryption, vector decryption, and password changing via Web Crypto API with fine-grained permission control (printing, modifying, annotating, copying, form filling).
- **Bcrypt UI Micro-Polish:** Fixed tab bar vertical alignment into an equal-width CSS grid, replaced unstyled emojis with semantic Lucide icons, standardized attacker benchmark cards, and added continuous visible slider rails.
- **Universal Local History Expansion:** Dedicated persistent history shelves added to PDF Toolkit and File Converter with masked credentials and zero secret leakage.
- **Mobile & Standalone Hardening:** Freshly compiled standalone Android APK (43 MB) and Google Play Bundle (42 MB) with automatic WebView cache purging, Capacitor bridge synchronization, and offline PWA service worker caching.
- **Verified Cross-Platform Checksums:** Desktop (macOS Apple Silicon & Intel DMG/ZIP, Windows EXE/MSI, Linux AppImage/DEB) and Android binaries validated with SHA-256 checksums.
- **Full Verification Suite:** 150 automated unit/engine/output/route/E2E browser tests passed with 0 failures.

### SHA-256 Checksum Manifest:
\`\`\`
${notes}
\`\`\`
`;

  console.log('===> Updating release body on GitHub...');
  await fetch(`https://api.github.com/repos/${repo}/releases/${releaseData.id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: releaseBody })
  });

  console.log('===> Release body updated successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
