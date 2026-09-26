import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless',
  '--remote-debugging-port=9225',
  '--disable-gpu',
  '--window-size=375,667'
]);

await new Promise(r => setTimeout(r, 1500));

const targets = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9225/json', res => {
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
await new Promise(r => setTimeout(r, 2500));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/Users/satyajishu/Downloads/sjenix-fix/test_hero_375.png', Buffer.from(shot.data, 'base64'));
console.log('Saved test_hero_375.png');

ws.close();
chrome.kill();
process.exit(0);
