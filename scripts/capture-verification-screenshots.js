import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

const SHOTS = [
  { route: '/tools/imgconvert', width: 375, name: 'screenshot_imgconvert_375.png' },
  { route: '/tools/colorpicker', width: 375, name: 'screenshot_colorpicker_375.png' },
  { route: '/tools/qrcode', width: 375, name: 'screenshot_qrcode_375.png' },
  { route: '/tools/password', width: 375, name: 'screenshot_password_375.png' },
  { route: '/tools/pdf', width: 375, name: 'screenshot_pdf_375.png' },
  { route: '/tools/imgcompress', width: 1280, name: 'screenshot_imgcompress_1280.png' },
];

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9234',
    '--disable-gpu',
    '--no-sandbox'
  ]);
  await new Promise(r => setTimeout(r, 2000));

  try {
    const list = await (await fetch('http://127.0.0.1:9234/json')).json();
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

    for (const item of SHOTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: item.width,
        height: 900,
        deviceScaleFactor: 2,
        mobile: item.width < 768
      });

      await send('Page.navigate', { url: `http://localhost:4173${item.route}` });
      await new Promise(r => setTimeout(r, 1200));

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot?.data) {
        fs.writeFileSync(item.name, Buffer.from(shot.data, 'base64'));
        console.log(`Captured ${item.name} (${item.width}px)`);
      }
    }

    ws.close();
    chrome.kill();
  } catch(e) {
    console.error(e);
    chrome.kill();
  }
}

main();
