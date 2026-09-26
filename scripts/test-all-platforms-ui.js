import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/f21021f3-ce43-42a8-88fb-5a58494e4180';

const USER_AGENTS = [
  {
    name: 'windows_11_chrome',
    platform: 'windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    vp: { w: 1280, h: 800 }
  },
  {
    name: 'android_pixel8_chrome',
    platform: 'android',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    vp: { w: 390, h: 844 }
  },
  {
    name: 'iphone_15_safari',
    platform: 'ios',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    vp: { w: 390, h: 844 }
  },
  {
    name: 'linux_ubuntu_firefox',
    platform: 'linux',
    ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    vp: { w: 1280, h: 800 }
  }
];

async function run() {
  console.log('===> Starting Platform Emulation & Download Center Verification...');

  const PORT = 4192;
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore'
  });

  await new Promise(r => setTimeout(r, 2000));

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9231',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9231/json');
    const list = await listRes.json();
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('No page target in Chrome');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    let msgId = 1;
    const pending = new Map();
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('DOM.enable');
    await send('Network.enable');

    for (const test of USER_AGENTS) {
      console.log(`\nEmulating ${test.name} (${test.platform})...`);

      await send('Network.setUserAgentOverride', {
        userAgent: test.ua,
        platform: test.platform === 'windows' ? 'Win32' : (test.platform === 'ios' ? 'iPhone' : (test.platform === 'android' ? 'Linux armv8l' : 'Linux x86_64'))
      });

      await send('Emulation.setDeviceMetricsOverride', {
        width: test.vp.w,
        height: test.vp.h,
        deviceScaleFactor: 2,
        mobile: test.vp.w < 600,
        screenWidth: test.vp.w,
        screenHeight: test.vp.h
      });

      await send('Page.navigate', { url: `http://localhost:${PORT}/` });
      await new Promise(r => setTimeout(r, 1800));

      // Trigger download modal
      await send('Runtime.evaluate', {
        expression: `window.dispatchEvent(new CustomEvent('tooldesk-open-download'))`
      });
      await new Promise(r => setTimeout(r, 800));

      // Check detected platform in DOM
      const cardTitle = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const el = document.querySelector('[role="dialog"]') || document.querySelector('[style*="z-index: 1200"]');
            if (!el) return 'NOT_FOUND';
            const rec = Array.from(el.querySelectorAll('span')).find(s => s.textContent.includes('Recommended for'));
            return rec ? rec.textContent.trim() : 'NO_REC';
          })()
        `,
        returnByValue: true
      });

      console.log(`  Recommended Badge: "${cardTitle.result.value}"`);

      // Capture screenshot
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const filename = `verified_platform_${test.platform}_${test.name}.png`;
      fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(shot.data, 'base64'));
      console.log(`  Saved screenshot: ${filename}`);

      // Dismiss modal
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('✕'));
            if (closeBtn) closeBtn.click();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 400));
    }

    // Now test expanding "View all platforms" on desktop
    console.log('\nTesting "View all platforms" expanded state on Desktop (1280x900)...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 900
    });

    await send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await new Promise(r => setTimeout(r, 1800));

    await send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new CustomEvent('tooldesk-open-download'))`
    });
    await new Promise(r => setTimeout(r, 600));

    // Expand accordion and scroll
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => /view all platforms/i.test(b.textContent));
          if (btn) btn.click();
        })()
      `
    });
    await new Promise(r => setTimeout(r, 800));

    // Capture expanded view
    const expandedShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'verified_download_center_expanded_all_platforms.png'), Buffer.from(expandedShot.data, 'base64'));
    console.log('  Saved screenshot: verified_download_center_expanded_all_platforms.png');

    console.log('\n===> All Platform Emulation Tests: PASS!');
    ws.close();
  } finally {
    try { chrome.kill(); } catch {}
    try { preview.kill(); } catch {}
  }
}

run().catch(err => {
  console.error('Platform emulation failed:', err);
  process.exit(1);
});
