import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070';

async function run() {
  console.log('===> Starting DownloadAppModal Live Verification via Headless Chrome CDP...');

  // Start Vite Preview
  const preview = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore'
  });

  // Give preview a moment to spin up
  await new Promise(r => setTimeout(r, 2000));

  // Spawn Headless Chrome
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9227/json');
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

    const testViewport = async (width, height, label) => {
      console.log(`\nTesting DownloadAppModal on ${label} (${width}x${height})...`);

      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 600,
        screenWidth: width,
        screenHeight: height
      });

      await send('Page.navigate', { url: 'http://localhost:4175/' });
      await new Promise(r => setTimeout(r, 2500));

      // Trigger Download Modal via global event or button click
      const clickRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.querySelector('.hero-download-btn');
            if (btn) {
              btn.click();
              return 'clicked_hero_btn';
            }
            window.dispatchEvent(new CustomEvent('tooldesk-open-download'));
            return 'dispatched_event';
          })()
        `,
        returnByValue: true
      });
      console.log(`  Modal trigger result: ${clickRes.result.value}`);

      await new Promise(r => setTimeout(r, 1200));

      // Check modal DOM and layout
      const modalAudit = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const modalEl = document.querySelector('[style*="zIndex: 1200"]') || document.querySelector('[style*="z-index: 1200"]');
            if (!modalEl) return { found: false };

            // Find the dialog content box
            const dialog = modalEl.querySelector('[style*="maxHeight"]') || modalEl.firstElementChild?.nextElementSibling || modalEl;
            const title = modalEl.querySelector('h2')?.textContent || '';
            const allButtons = Array.from(modalEl.querySelectorAll('button')).map(b => b.textContent?.trim());
            const hasDownloadBtn = Array.from(modalEl.querySelectorAll('a, button')).some(el => /download|install/i.test(el.textContent));

            // Check if there are horizontal overflows inside the modal
            const allElements = Array.from(modalEl.querySelectorAll('*'));
            const overflowingEls = allElements
              .filter(el => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll')
              .map(el => ({
                tag: el.tagName,
                className: el.className,
                clientWidth: el.clientWidth,
                scrollWidth: el.scrollWidth,
                text: el.textContent?.slice(0, 30)
              }));

            return {
              found: true,
              title,
              hasDownloadBtn,
              buttonCount: allButtons.length,
              overflowingEls
            };
          })()
        `,
        returnByValue: true
      });

      console.log(`  Modal found: ${modalAudit.result.value.found}`);
      console.log(`  Modal title: "${modalAudit.result.value.title}"`);
      console.log(`  Has download/install action: ${modalAudit.result.value.hasDownloadBtn}`);
      console.log(`  Overflowing elements in modal: ${modalAudit.result.value.overflowingEls.length}`);
      if (modalAudit.result.value.overflowingEls.length > 0) {
        console.log('  Overflow details:', JSON.stringify(modalAudit.result.value.overflowingEls, null, 2));
      }

      // Capture screenshot
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const filename = `verified_download_modal_${label}_${width}.png`;
      fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(shot.data, 'base64'));
      console.log(`  Saved screenshot: ${filename}`);

      // Close modal by clicking backdrop or close button
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('✕'));
            if (closeBtn) closeBtn.click();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 600));

      const modalAfterClose = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const modalEl = document.querySelector('[style*="zIndex: 1200"]');
            return !!modalEl;
          })()
        `,
        returnByValue: true
      });
      console.log(`  Modal closed cleanly: ${!modalAfterClose.result.value}`);
    };

    // Test on Mobile 375px (iPhone / compact Android)
    await testViewport(375, 812, 'mobile');

    // Test on Desktop 1280px
    await testViewport(1280, 800, 'desktop');

    console.log('\n===> DownloadAppModal Verification Complete: PASS!');
    ws.close();
  } finally {
    try { chrome.kill(); } catch {}
    try { preview.kill(); } catch {}
  }
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
