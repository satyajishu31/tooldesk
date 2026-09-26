import http from 'http';
import { spawn } from 'child_process';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless',
  '--remote-debugging-port=9222',
  '--disable-gpu',
  '--window-size=390,844'
]);

await new Promise(r => setTimeout(r, 1500));

const targets = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json', res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => resolve(JSON.parse(raw)));
  }).on('error', reject);
});

const pageTarget = targets.find(t => t.type === 'page') || targets[0];
const wsUrl = pageTarget.webSocketDebuggerUrl;

// Use WebSocket to connect to Chrome
const WebSocket = (await import('ws')).default || (await import('ws'));
const ws = new WebSocket(wsUrl);

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

// Enable Page and Runtime
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});

await send('Page.navigate', { url: 'http://localhost:4173/' });
await new Promise(r => setTimeout(r, 3000));

// Check overflowing elements
const evalResult = await send('Runtime.evaluate', {
  expression: `(() => {
    const vw = window.innerWidth;
    const overflowing = [];
    document.querySelectorAll('*').forEach(el => {
      // ignore intentional horizontal scrollers
      const style = window.getComputedStyle(el);
      const isXScrollable = style.overflowX === 'auto' || style.overflowX === 'scroll';
      const rect = el.getBoundingClientRect();
      
      if (!isXScrollable && (rect.right > vw + 2 || el.scrollWidth > el.clientWidth + 2)) {
        // Find a useful identifier
        let sel = el.tagName.toLowerCase();
        if (el.id) sel += '#' + el.id;
        if (el.className && typeof el.className === 'string') sel += '.' + el.className.trim().split(/\\s+/).join('.');
        
        overflowing.push({
          sel,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          rectLeft: Math.round(rect.left),
          rectRight: Math.round(rect.right),
          overflowX: style.overflowX,
          text: (el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')
        });
      }
    });
    return JSON.stringify({
      overflowCount: overflowing.length,
      items: overflowing.slice(0, 20)
    });
  })()`
});

console.log(JSON.stringify(evalResult, null, 2));

ws.close();
chrome.kill();
process.exit(0);
