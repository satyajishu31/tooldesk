import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const VIEWPORTS = [
  320, 344, 360, 375, 390, 393, 414, 430, 480, 540,
  600, 768, 820, 834, 900, 1024, 1280, 1366, 1440, 1536,
  1600, 1920, 2560
];

const ROUTES = [
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
  '/tools/country-finder',
];

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9230',
    '--disable-gpu',
    '--no-sandbox'
  ]);
  await new Promise(r => setTimeout(r, 2000));

  try {
    const list = await (await fetch('http://127.0.0.1:9230/json')).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(res => ws.on('open', res));

    let id = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const msgId = id++;
        const handler = data => {
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

    console.log(`Auditing ${ROUTES.length} routes across ${VIEWPORTS.length} viewports (320px to 2560px)...`);
    
    // We sample critical mobile/tablet/desktop breakpoints across all routes,
    // plus all 23 viewports on core tool routes.
    const issues = [];

    // 1. Audit all 37 routes at 320px (extreme narrow mobile) and 768px (tablet) and 1440px (desktop)
    const baseViewports = [320, 375, 768, 1440];
    for (const w of baseViewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 850,
        deviceScaleFactor: 2,
        mobile: w < 768
      });

      for (const route of ROUTES) {
        await send('Page.navigate', { url: `http://localhost:4173${route}` });
        await new Promise(r => setTimeout(r, 450));

        const evalRes = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const body = document.body;
              const doc = document.documentElement;
              const hasHorizScroll = (doc.scrollWidth > window.innerWidth + 2) || (body.scrollWidth > window.innerWidth + 2);
              const maxOverflow = Math.max(doc.scrollWidth - window.innerWidth, body.scrollWidth - window.innerWidth, 0);
              
              // Check for clipped / overflowing elements
              let clipped = 0;
              const elements = document.querySelectorAll('.tool-card-glass, .tool-shell, button, input, select');
              for (const el of elements) {
                const r = el.getBoundingClientRect();
                if (r.right > window.innerWidth + 2 || r.left < -2) {
                  clipped++;
                }
              }

              return { hasHorizScroll, maxOverflow, clipped };
            })()
          `,
          returnByValue: true
        });

        const val = evalRes?.result?.value;
        if (val?.hasHorizScroll || val?.clipped > 0) {
          console.warn(`  [${w}px] ✗ Issue on ${route}: Overflow=${val.maxOverflow}px, Clipped=${val.clipped}`);
          issues.push({ width: w, route, overflow: val.maxOverflow, clipped: val.clipped });
        }
      }
    }

    // 2. Audit ALL 23 viewports on representative multi-control tool routes
    const sampleRoutes = ['/tools/password', '/tools/imgcompress', '/tools/imgresizer', '/tools/pdf', '/tools/qrcode', '/tools/website-analyzer', '/tools/colorpicker'];
    for (const w of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 850,
        deviceScaleFactor: 2,
        mobile: w < 768
      });

      for (const route of sampleRoutes) {
        await send('Page.navigate', { url: `http://localhost:4173${route}` });
        await new Promise(r => setTimeout(r, 350));

        const evalRes = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const body = document.body;
              const doc = document.documentElement;
              const hasHorizScroll = (doc.scrollWidth > window.innerWidth + 2) || (body.scrollWidth > window.innerWidth + 2);
              const maxOverflow = Math.max(doc.scrollWidth - window.innerWidth, body.scrollWidth - window.innerWidth, 0);
              return { hasHorizScroll, maxOverflow };
            })()
          `,
          returnByValue: true
        });

        const val = evalRes?.result?.value;
        if (val?.hasHorizScroll) {
          console.warn(`  [${w}px] ✗ Horizontal scroll on ${route}: ${val.maxOverflow}px`);
          issues.push({ width: w, route, overflow: val.maxOverflow });
        }
      }
    }

    console.log(`\nAudit complete: ${issues.length} responsive issues found.`);
    ws.close();
    chrome.kill();
    process.exit(issues.length > 0 ? 1 : 0);
  } catch(e) {
    console.error('Audit runner error:', e);
    chrome.kill();
    process.exit(1);
  }
}

main();
