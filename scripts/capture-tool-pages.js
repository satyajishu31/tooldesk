import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const pagesToCapture = [
  { url: 'http://localhost:5173/tools/password', name: 'tool_password' },
  { url: 'http://localhost:5173/tools/wordcount', name: 'tool_wordcount' },
  { url: 'http://localhost:5173/tools/pdf', name: 'tool_pdf' },
  { url: 'http://localhost:5173/tools/imgresizer', name: 'tool_imgresizer' },
  { url: 'http://localhost:5173/tools/qrcode', name: 'tool_qrcode' },
  { url: 'http://localhost:5173/tools/currency', name: 'tool_currency' },
];

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9231',
  '--disable-gpu',
  '--window-size=1280,900'
]);

await new Promise(r => setTimeout(r, 1500));

try {
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9231/json', res => {
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
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  for (const page of pagesToCapture) {
    await send('Page.navigate', { url: page.url });
    await new Promise(r => setTimeout(r, 1500));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070/scratch/${page.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${page.name}.png`);
  }

  ws.close();
} catch (e) {
  console.error('Error:', e);
} finally {
  chrome.kill();
}
