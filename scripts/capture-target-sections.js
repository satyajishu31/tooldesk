import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

async function capture() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9235',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-snap-target-sections-v2'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9235/json');
    const list = await listRes.json();
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('No page target found');

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

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:4173/' });
    await new Promise(r => setTimeout(r, 2500));

    // Force all deferred sections visible
    await send('Runtime.evaluate', {
      expression: `
        document.querySelectorAll('.home-section-deferred').forEach(el => {
          el.style.contentVisibility = 'visible';
        });
      `
    });
    await new Promise(r => setTimeout(r, 500));

    const artifactDir = '/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070';

    // 1. Reviews Section
    await send('Runtime.evaluate', {
      expression: `
        const el = document.querySelector('.tooldesk-reviews-grid');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const revShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/real_reviews_section.png`, Buffer.from(revShot.data, 'base64'));
    console.log('Saved real_reviews_section.png');

    // 2. Who Uses ToolDesk Section
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('about');
        if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const aboutShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/real_about_personas.png`, Buffer.from(aboutShot.data, 'base64'));
    console.log('Saved real_about_personas.png');

    // 3. Why ToolDesk Section
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('why');
        if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const whyShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/real_why_pillars.png`, Buffer.from(whyShot.data, 'base64'));
    console.log('Saved real_why_pillars.png');

    // 4. Comparison Matrix Details (scroll down inside cloud-vs-tooldesk)
    await send('Runtime.evaluate', {
      expression: `
        const el = document.querySelector('.tooldesk-matrix-row');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const matrixShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/real_matrix_details.png`, Buffer.from(matrixShot.data, 'base64'));
    console.log('Saved real_matrix_details.png');

    ws.close();
    chrome.kill();
    console.log('ALL REAL TARGET SECTIONS CAPTURED');
  } catch (e) {
    console.error('Capture error:', e);
    chrome.kill();
    process.exit(1);
  }
}

capture();
