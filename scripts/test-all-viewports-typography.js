import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const VIEWPORTS = [320, 360, 375, 390, 414, 430, 480, 540, 600, 768, 820, 834, 900, 1024, 1280, 1440, 1920, 2560];

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9228',
  '--disable-gpu',
  '--no-sandbox'
]);

await new Promise(r => setTimeout(r, 2000));

const listRes = await fetch('http://127.0.0.1:9228/json');
const list = await listRes.json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));

let id = 1;
function send(method, params = {}) {
  return new Promise(resolve => {
    const msgId = id++;
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === msgId) { ws.off('message', handler); resolve(msg.result); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

await send('Page.enable');

const results = [];

for (const w of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: 900,
    deviceScaleFactor: 2,
    mobile: w < 768
  });

  await send('Page.navigate', { url: 'http://localhost:4173/' });
  await new Promise(r => setTimeout(r, 2000));

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const h1 = document.querySelector('.hero-h1');
      const s = window.getComputedStyle(h1);
      const sw = document.documentElement.scrollWidth;
      const iw = window.innerWidth;
      const r = h1.getBoundingClientRect();
      return JSON.stringify({
        viewport: ${w},
        iw,
        sw,
        hasOverflow: sw > iw,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontFamily: s.fontFamily,
        fontWeight: s.fontWeight,
        letterSpacing: s.letterSpacing,
        h1Width: Math.round(r.width),
        h1Right: Math.round(r.right)
      });
    })()`,
    returnByValue: true
  });

  const parsed = JSON.parse(evalRes.result.value);
  results.push(parsed);
}

console.table(results);

ws.close();
chrome.kill();
process.exit(0);
