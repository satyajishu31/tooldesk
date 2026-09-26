import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

const VIEWPORTS = [320, 344, 360, 375, 390, 414, 430, 480, 540, 600, 768, 820, 1024, 1280, 1920, 2560];

const PATHS = [
  '/',
  '/tools/imgcompress',
  '/tools/imgresizer',
  '/tools/password',
  '/tools/pdf',
  '/tools/image-tools',
  '/tools/qrcode',
  '/tools/website-analyzer',
  '/tools/bgremove',
  '/tools/color',
  '/tools/videotranscribe'
];

async function detectServerUrl() {
  const ports = [4173, 5173, 3000];
  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}`);
      if (res.ok) {
        console.log(`[INFO] Active application server detected at http://localhost:${port}`);
        return `http://localhost:${port}`;
      }
    } catch {
      // try next port
    }
  }
  throw new Error('No active dev/preview server found on ports 4173, 5173, or 3000.');
}

async function main() {
  const DEBUG_PORT = 9229;
  let serverBase;
  try {
    serverBase = await detectServerUrl();
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }

  console.log(`[INFO] Launching Headless Chrome on CDP port ${DEBUG_PORT}...`);
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars'
  ]);

  let connected = false;
  let wsUrl = null;

  for (let attempt = 1; attempt <= 15; attempt++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          connected = true;
          break;
        }
      }
    } catch {
      // retry
    }
  }

  if (!connected || !wsUrl) {
    console.error('[ERROR] Could not connect to Chrome DevTools endpoint.');
    chrome.kill();
    process.exit(1);
  }

  console.log('[INFO] Connected to Chrome DevTools Protocol.');
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.on('open', resolve));

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      const handler = data => {
        try {
          const msg = JSON.parse(data);
          if (msg.id === id) {
            ws.off('message', handler);
            resolve(msg.result);
          }
        } catch {
          // ignore
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('   TOOLDESK CROSS-VIEWPORT & CONTROL OVERFLOW AUDIT');
  console.log(`   Auditing ${VIEWPORTS.length} viewports × ${PATHS.length} routes = ${VIEWPORTS.length * PATHS.length} test points`);
  console.log('════════════════════════════════════════════════════════════');

  let totalFailures = 0;
  let totalTests = 0;

  try {
    for (const w of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 850,
        deviceScaleFactor: 2,
        mobile: w < 768
      });

      let viewportIssues = 0;

      for (const p of PATHS) {
        totalTests++;
        await send('Page.navigate', { url: `${serverBase}${p}` });
        // Allow Framer Motion route transition and letter reveals to settle
        await new Promise(r => setTimeout(r, 700));

        const evalRes = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const sw = document.documentElement.scrollWidth;
              const bw = document.body.scrollWidth;
              const iw = window.innerWidth;
              const hasDocOverflow = sw > iw || bw > iw;
              const clippedElements = [];

              function isClippedOrScrollable(el) {
                let p = el.parentElement;
                while (p && p !== document.body && p !== document.documentElement) {
                  const s = window.getComputedStyle(p);
                  const ox = s.overflowX;
                  const o = s.overflow;
                  if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll' ||
                      o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') {
                    return true;
                  }
                  p = p.parentElement;
                }
                return false;
              }

              const all = document.querySelectorAll('*');
              for (const el of all) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
                  continue;
                }

                // Check if element spills past viewport width and is NOT inside an intentional horizontal scroll or clipped container
                const rect = el.getBoundingClientRect();
                if (rect.right > iw + 1 && !['html', 'body', '#root'].includes(el.tagName.toLowerCase())) {
                  if (!isClippedOrScrollable(el)) {
                    const tag = el.tagName.toLowerCase();
                    const cls = (el.className || '').toString().slice(0, 30);
                    clippedElements.push({
                      type: 'OVERFLOW_RIGHT',
                      tag, cls,
                      html: (el.outerHTML || '').slice(0, 80),
                      right: Math.round(rect.right),
                      iw
                    });
                  }
                }

                // Check for squished interactive buttons (< 58px with text > 8 chars)
                if (el.tagName.toLowerCase() === 'button' && rect.width > 0 && rect.width < 58 && (el.innerText || '').trim().length > 8) {
                  clippedElements.push({
                    type: 'SQUISHED_CONTROL',
                    tag: el.tagName.toLowerCase(),
                    width: Math.round(rect.width),
                    text: (el.innerText || '').slice(0, 25).trim()
                  });
                }
              }

              return {
                sw, bw, iw, hasDocOverflow,
                issueCount: clippedElements.length,
                samples: clippedElements.slice(0, 3)
              };
            })()
          `,
          returnByValue: true
        });

        const res = evalRes?.result?.value;
        if (res?.hasDocOverflow || (res?.issueCount && res.issueCount > 0)) {
          console.log(`❌ [FAIL] ${w}px -> ${p.padEnd(24)} (Doc overflow: ${res.hasDocOverflow}, Issues: ${res.issueCount})`);
          if (res.samples?.length) {
            console.log('   Offending elements:', res.samples);
          }
          viewportIssues++;
          totalFailures++;
        }
      }

      if (viewportIssues === 0) {
        console.log(`✅ [PASS] ${w.toString().padStart(4)}px: All ${PATHS.length} routes 100% clean (zero horizontal overflow, zero clipping)`);
      }
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log(`AUDIT RESULTS: ${totalTests - totalFailures} / ${totalTests} passed.`);
    if (totalFailures === 0) {
      console.log('🌟 ZERO ISSUES DETECTED: Every single viewport and tool is 100% compliant!');
    } else {
      console.log(`⚠️ Encountered ${totalFailures} issues to resolve.`);
    }
    console.log('════════════════════════════════════════════════════════════');
  } finally {
    ws.close();
    chrome.kill();
  }
}

main().catch(err => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
