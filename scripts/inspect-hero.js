import http from 'http';
import { spawn } from 'child_process';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless',
  '--remote-debugging-port=9226',
  '--disable-gpu',
  '--window-size=375,667'
]);

await new Promise(r => setTimeout(r, 3000));

const targets = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9226/json', res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => resolve(JSON.parse(raw)));
  }).on('error', reject);
});

const pageTarget = targets.find(t => t.type === 'page') || targets[0];
const WebSocket = (await import('ws')).default || (await import('ws'));
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

await new Promise(r => ws.on('open', r));

let id = 1;
function send(method, params = {}) {
  return new Promise((resolve) => {
    const msgId = id++;
    const handler = (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.id === msgId) {
        ws.off('message', handler);
        resolve(parsed.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 375,
  height: 667,
  deviceScaleFactor: 2,
  mobile: true
});

await send('Page.navigate', { url: 'http://localhost:4173/' });
await new Promise(r => setTimeout(r, 7500));

const evalResult = await send('Runtime.evaluate', {
  expression: `(() => {
    const h1 = document.querySelector('.hero-h1');
    const wrap = document.querySelector('.hero-content-wrap');
    const rot = document.querySelector('.hero-rotating-text');
    const mob = document.querySelector('.hero-text-mobile');
    const lines = document.querySelectorAll('.hero-headline-line');

    const info = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        tag: el.tagName,
        class: el.className,
        rect: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },
        fontFamily: s.fontFamily,
        fontWeight: s.fontWeight,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        maxWidth: s.maxWidth,
        width: s.width,
        whiteSpace: s.whiteSpace,
        text: el.innerText
      };
    };

    return JSON.stringify({
      windowWidth: window.innerWidth,
      isSyneLoaded: document.fonts.check('800 35px Syne'),
      fonts: Array.from(document.fonts).map(f => ({ family: f.family, status: f.status, weight: f.weight })),
      wrap: info(wrap),
      h1: info(h1),
      rot: info(rot),
      mob: info(mob),
      lines: Array.from(lines).map(info)
    }, null, 2);
  })()`
});

const ss = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('fs');
fs.writeFileSync('screenshot_hero_restored_375.png', Buffer.from(ss.data, 'base64'));

console.log(evalResult.result.value);

ws.close();
chrome.kill();
process.exit(0);
