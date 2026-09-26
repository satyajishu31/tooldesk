import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

const ARTIFACT_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070';

async function capture() {
  console.log('--- STARTING VERIFICATION CAPTURE ---');
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9255',
    '--disable-gpu',
    '--no-sandbox'
  ]);
  await new Promise(r => setTimeout(r, 2000));

  try {
    const list = await (await fetch('http://127.0.0.1:9255/json')).json();
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

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
      return res?.result?.value;
    }

    // 1. CAPTURE DESKTOP (1280x900)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });
    await send('Page.navigate', { url: 'http://localhost:4173/' });
    await new Promise(r => setTimeout(r, 1600));

    // Scroll to cloud vs tooldesk section
    await evaluate(`
      const el = document.getElementById('cloud-vs-tooldesk');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    `);
    await new Promise(r => setTimeout(r, 800));

    const cloudDesktopShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/cloud_vs_tooldesk_desktop.png`, Buffer.from(cloudDesktopShot.data, 'base64'));
    console.log('Saved cloud_vs_tooldesk_desktop.png');

    // Scroll to stats section
    await evaluate(`
      const el = document.querySelector('.stats-grid-section');
      if (el) {
        const top = el.getBoundingClientRect().top + window.pageYOffset - 180;
        window.scrollTo(0, top);
      }
    `);
    await new Promise(r => setTimeout(r, 1200));

    const statsDesktopShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/stats_3d_icons_desktop.png`, Buffer.from(statsDesktopShot.data, 'base64'));
    console.log('Saved stats_3d_icons_desktop.png');

    // 2. CAPTURE MOBILE (390x844)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send('Page.navigate', { url: 'http://localhost:4173/' });
    await new Promise(r => setTimeout(r, 1600));

    // Scroll to cloud vs tooldesk section on mobile
    await evaluate(`
      const el = document.getElementById('cloud-vs-tooldesk');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    `);
    await new Promise(r => setTimeout(r, 800));

    const cloudMobileShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/cloud_vs_tooldesk_mobile.png`, Buffer.from(cloudMobileShot.data, 'base64'));
    console.log('Saved cloud_vs_tooldesk_mobile.png');

    // Scroll to stats section on mobile
    await evaluate(`
      const el = document.querySelector('.stats-grid-section');
      if (el) {
        const top = el.getBoundingClientRect().top + window.pageYOffset - 150;
        window.scrollTo(0, top);
      }
    `);
    await new Promise(r => setTimeout(r, 1200));

    const statsMobileShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/stats_3d_icons_mobile.png`, Buffer.from(statsMobileShot.data, 'base64'));
    console.log('Saved stats_3d_icons_mobile.png');

    // Check overflow
    const overflowCheck = await evaluate(`
      (() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth
        };
      })()
    `);
    console.log('Mobile 390px overflow check:', overflowCheck);

    ws.close();
    chrome.kill();
    console.log('--- CAPTURE COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Error during capture:', err);
    chrome.kill();
  }
}

capture();
