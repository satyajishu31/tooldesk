import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9230',
  '--disable-gpu',
  '--window-size=1280,900'
]);

await new Promise(r => setTimeout(r, 1500));

try {
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9230/json', res => {
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

  await send('Page.navigate', { url: 'http://localhost:5173/#tools' });
  await new Promise(r => setTimeout(r, 2000));

  // Scroll into view of #tools
  await send('Runtime.evaluate', {
    expression: `
      const toolsSec = document.getElementById('tools');
      if (toolsSec) {
        toolsSec.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    `
  });
  await new Promise(r => setTimeout(r, 1000));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070/scratch/tools_section_desktop.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved tools_section_desktop.png');

  // Let's also capture mobile view 390x844
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 500));
  await send('Runtime.evaluate', {
    expression: `
      const toolsSec = document.getElementById('tools');
      if (toolsSec) {
        toolsSec.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    `
  });
  await new Promise(r => setTimeout(r, 1000));

  const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070/scratch/tools_section_mobile.png', Buffer.from(mobileShot.data, 'base64'));
  console.log('Saved tools_section_mobile.png');

  ws.close();
} catch (e) {
  console.error('Error:', e);
} finally {
  chrome.kill();
}
