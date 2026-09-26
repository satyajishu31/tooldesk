import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

const ARTIFACT_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070';

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9299',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-snap-suite'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9299/json');
    const list = await listRes.json();
    const page = list.find(t => t.type === 'page');
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

    // DESKTOP: 1440x950
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:4173/' });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Cloud vs ToolDesk Showcase
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('cloud-vs-tooldesk');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const snapCloudDesk = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/cloud_showcase_desktop.png`, Buffer.from(snapCloudDesk.data, 'base64'));
    console.log('Saved cloud_showcase_desktop.png');

    // 2. Stats Section with 3D Icons
    await send('Runtime.evaluate', {
      expression: `
        const el = Array.from(document.querySelectorAll('section')).find(s => s.innerText.includes('LIVE STATS') || s.innerText.includes('Numbers That Speak'));
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      `
    });
    await new Promise(r => setTimeout(r, 1400));
    const snapStatsDesk = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/stats_section_desktop.png`, Buffer.from(snapStatsDesk.data, 'base64'));
    console.log('Saved stats_section_desktop.png');

    // MOBILE: 390x844
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://localhost:4173/' });
    await new Promise(r => setTimeout(r, 2000));

    // 3. Mobile Cloud vs ToolDesk
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('cloud-vs-tooldesk');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const snapCloudMob = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/cloud_showcase_mobile.png`, Buffer.from(snapCloudMob.data, 'base64'));
    console.log('Saved cloud_showcase_mobile.png');

    // 4. Mobile Stats Section
    await send('Runtime.evaluate', {
      expression: `
        const el = Array.from(document.querySelectorAll('section')).find(s => s.innerText.includes('LIVE STATS') || s.innerText.includes('Numbers That Speak'));
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      `
    });
    await new Promise(r => setTimeout(r, 1400));
    const snapStatsMob = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/stats_section_mobile.png`, Buffer.from(snapStatsMob.data, 'base64'));
    console.log('Saved stats_section_mobile.png');

    ws.close();
    chrome.kill();
    console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (e) {
    console.error(e);
    chrome.kill();
  }
}

main();
