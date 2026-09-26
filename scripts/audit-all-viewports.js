import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const VIEWPORTS = [320, 344, 360, 375, 390, 414, 430, 480, 540, 600, 768, 820, 834, 1024, 1280, 1440, 1920, 2560];

const PATHS = [
  '/',
  '/tools/password',
  '/tools/wordcount',
  '/tools/textcase',
  '/tools/units',
  '/tools/currency',
  '/tools/gradient',
  '/tools/quote',
  '/tools/favicon',
  '/tools/thumbnail',
  '/tools/imgresizer',
  '/tools/imgcompress',
  '/tools/imgconvert',
  '/tools/bgremove',
  '/tools/pdf',
  '/tools/aspectratio',
  '/tools/fileconvert',
  '/tools/vault',
  '/tools/image-tools',
  '/tools/imgborder',
  '/tools/roundcorner',
  '/tools/randname',
  '/tools/randaddress',
  '/tools/wordreplace',
  '/tools/bcrypt',
  '/tools/colorpicker',
  '/tools/video-screenshot',
  '/tools/video-transcriber',
  '/tools/website-analyzer',
  '/tools/translator',
  '/tools/qrcode',
  '/tools/barcode',
  '/tools/qrscan',
  '/tools/breach-check',
  '/tools/ip-lookup',
  '/tools/system-info',
  '/tools/country-finder'
];

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-audit-profile'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9226/json');
    const list = await listRes.json();
    const page = list.find(t => t.type === 'page');
    if (!page) {
      console.error('No page target found');
      chrome.kill();
      process.exit(1);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.on('open', resolve));

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        const handler = (data) => {
          const msg = JSON.parse(data);
          if (msg.id === msgId) {
            ws.off('message', handler);
            resolve(msg.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    console.log('--- AUDITING VIEWPORTS & OVERFLOWS ---');
    const failures = [];

    // Test problematic small viewports first for all paths
    const criticalViewports = [320, 360, 375, 414, 768, 1280];

    for (const w of criticalViewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 850,
        deviceScaleFactor: 2,
        mobile: w < 768
      });

      for (const p of PATHS) {
        await send('Page.navigate', { url: `http://localhost:4173${p}` });
        await new Promise(r => setTimeout(r, 350));

        const evalRes = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const sw = document.documentElement.scrollWidth;
              const iw = window.innerWidth;
              const hasOverflow = sw > iw;
              let offenders = [];
              if (hasOverflow) {
                const all = document.querySelectorAll('*');
                for (const el of all) {
                  const r = el.getBoundingClientRect();
                  if (r.right > iw + 1.5) {
                    offenders.push({
                      tag: el.tagName,
                      cls: (el.className || '').toString().slice(0, 40),
                      right: Math.round(r.right),
                      width: Math.round(r.width),
                      text: (el.innerText || '').slice(0, 30).replace(/\\n/g, ' ')
                    });
                  }
                }
              }
              return { sw, iw, hasOverflow, count: offenders.length, top: offenders.slice(0, 3) };
            })()
          `,
          returnByValue: true
        });

        const res = evalRes?.result?.value;
        if (res?.hasOverflow) {
          console.log(`[OVERFLOW] Width: ${w}px | Path: ${p} | sw: ${res.sw}px > iw: ${res.iw}px | Offenders: ${res.count}`);
          console.log('   Top offenders:', JSON.stringify(res.top));
          failures.push({ w, p, res });
        }
      }
    }

    console.log(`\n=== AUDIT COMPLETE: ${failures.length} overflows detected ===`);
    ws.close();
    chrome.kill();
  } catch (err) {
    console.error('Audit failed:', err);
    chrome.kill();
  }
}

main();
