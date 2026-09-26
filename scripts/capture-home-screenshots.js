import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

async function capture() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-snap-profile'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9227/json');
    const list = await listRes.json();
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('No page target');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(res => ws.on('open', res));

    let id = 1;
    function send(method, params = {}) {
      return new Promise(res => {
        const msgId = id++;
        const handler = (data) => {
          const msg = JSON.parse(data);
          if (msg.id === msgId) {
            ws.off('message', handler);
            res(msg.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    // 1. Desktop 1440x900
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:5173/' });
    await new Promise(r => setTimeout(r, 1800));
    const snapDesktop = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070/home_desktop_verified.png', Buffer.from(snapDesktop.data, 'base64'));
    console.log('Saved desktop screenshot');

    // 2. Mobile 375x812
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://localhost:5173/' });
    await new Promise(r => setTimeout(r, 1500));
    const snapMobile = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070/home_mobile_verified.png', Buffer.from(snapMobile.data, 'base64'));
    console.log('Saved mobile screenshot');

    ws.close();
    chrome.kill();
    console.log('DONE');
  } catch (err) {
    console.error('Capture err:', err);
    chrome.kill();
  }
}

capture();
