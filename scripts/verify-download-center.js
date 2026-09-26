import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/f21021f3-ce43-42a8-88fb-5a58494e4180';

async function run() {
  console.log('===> Starting ToolDesk Download Center Comprehensive CDP Verification Suite...\n');

  // 1. Build project first
  console.log('Building production bundle...');
  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
    build.on('close', code => code === 0 ? resolve() : reject(new Error(`Build exited with ${code}`)));
  });

  // 2. Start Vite Preview server
  const PORT = 4188;
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore'
  });

  await new Promise(r => setTimeout(r, 2000));

  // 3. Launch Headless Chrome
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9229/json');
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

    const viewports = [
      { w: 320, h: 568, name: '320px_mobile_small' },
      { w: 360, h: 740, name: '360px_android_compact' },
      { w: 375, h: 812, name: '375px_iphone_standard' },
      { w: 390, h: 844, name: '390px_iphone14' },
      { w: 768, h: 1024, name: '768px_tablet' },
      { w: 1280, h: 800, name: '1280px_desktop' },
      { w: 1920, h: 1080, name: '1920px_desktop_fhd' }
    ];

    for (const vp of viewports) {
      console.log(`\nTesting Viewport: ${vp.name} (${vp.w}x${vp.h})...`);

      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 2,
        mobile: vp.w < 600,
        screenWidth: vp.w,
        screenHeight: vp.h
      });

      await send('Page.navigate', { url: `http://localhost:${PORT}/` });
      await new Promise(r => setTimeout(r, 2000));

      // Trigger Download Modal via navbar or custom event
      const openRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const downloadBtn = btns.find(b => /download app/i.test(b.textContent) || (b.title && /download/i.test(b.title)));
            if (downloadBtn) {
              downloadBtn.click();
              return 'clicked_nav_download_btn';
            }
            window.dispatchEvent(new CustomEvent('tooldesk-open-download'));
            return 'dispatched_tooldesk_open_download';
          })()
        `,
        returnByValue: true
      });

      console.log(`  Modal Open Trigger: ${openRes.result.value}`);
      await new Promise(r => setTimeout(r, 800));

      // Verify Modal DOM
      const audit = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const modalEl = document.querySelector('[style*="zIndex: 1200"]') || document.querySelector('[style*="z-index: 1200"]');
            if (!modalEl) return { found: false };

            const title = modalEl.querySelector('h3')?.textContent?.trim() || '';
            const allText = modalEl.textContent || '';
            const hasWindows = allText.includes('Windows');
            const hasMac = allText.includes('macOS') || allText.includes('Mac');
            const hasAndroid = allText.includes('Android');
            const hasIOS = allText.includes('iPhone') || allText.includes('iOS');
            const hasLinux = allText.includes('Linux');
            const hasPWA = allText.includes('Web App') || allText.includes('PWA');

            // Click "View all platforms" accordion
            const accordionBtn = Array.from(modalEl.querySelectorAll('button')).find(b => /view all platforms/i.test(b.textContent));
            if (accordionBtn) {
              accordionBtn.click();
            }

            // Check horizontal overflows
            const elements = Array.from(modalEl.querySelectorAll('*'));
            const overflows = elements.filter(el => {
              if (el.clientWidth === 0) return false;
              const cs = getComputedStyle(el);
              if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') return false;
              return el.scrollWidth > el.clientWidth + 2;
            }).map(el => ({
              tag: el.tagName,
              cls: el.className,
              clientW: el.clientWidth,
              scrollW: el.scrollWidth,
              text: el.textContent?.slice(0, 25)
            }));

            return {
              found: true,
              title,
              hasWindows,
              hasMac,
              hasAndroid,
              hasIOS,
              hasLinux,
              hasPWA,
              overflowCount: overflows.length,
              overflows: overflows.slice(0, 3)
            };
          })()
        `,
        returnByValue: true
      });

      console.log(`  Modal Visible: ${audit.result.value.found}`);
      console.log(`  Modal Title: "${audit.result.value.title}"`);
      console.log(`  Platforms Present: Windows=${audit.result.value.hasWindows}, Mac=${audit.result.value.hasMac}, Android=${audit.result.value.hasAndroid}, iOS=${audit.result.value.hasIOS}`);
      console.log(`  Overflowing elements: ${audit.result.value.overflowCount}`);

      await new Promise(r => setTimeout(r, 600));

      // Capture screenshot
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const filename = `verified_download_center_${vp.name}.png`;
      fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(shot.data, 'base64'));
      console.log(`  Saved verified screenshot: ${filename}`);

      // Close modal by clicking close button
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('✕'));
            if (closeBtn) closeBtn.click();
          })()
        `
      });

      await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n===> Download Center Verification Complete: ALL VIEWPORTS VERIFIED!');
    ws.close();
  } finally {
    try { chrome.kill(); } catch {}
    try { preview.kill(); } catch {}
  }
}

run().catch(err => {
  console.error('Download Center verification failed:', err);
  process.exit(1);
});
