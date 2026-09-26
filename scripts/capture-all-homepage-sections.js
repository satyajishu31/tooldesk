import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

async function capture() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9233',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-snap-hp-sections'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9233/json');
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

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:4173/' });
    await new Promise(r => setTimeout(r, 2500));

    // Force all deferred sections visible for instant rasterization
    await send('Runtime.evaluate', {
      expression: `
        document.querySelectorAll('.home-section-deferred').forEach(el => {
          el.style.contentVisibility = 'visible';
        });
      `
    });
    await new Promise(r => setTimeout(r, 500));

    const sections = [
      { name: '1_hero', selector: '.hero-section' },
      { name: '2_tools_grid', selector: '#tools' },
      { name: '3_how_it_works', selector: 'section:has(h2:contains("Four Steps")), section:nth-of-type(3)' },
      { name: '4_about_creators', selector: '#about' },
      { name: '5_why_tooldesk', selector: '#why' },
      { name: '6_cloud_vs_sandbox', selector: '#cloud-vs-tooldesk' },
      { name: '7_live_stats', selector: '#home-stats-section' },
      { name: '8_reviews', selector: '.tooldesk-reviews-grid' },
      { name: '9_faq', selector: 'section:has(h2:contains("Common Questions")), section:nth-of-type(8)' },
      { name: '10_cta_footer', selector: 'footer' }
    ];

    const artifactDir = '/Users/satyajishu/.gemini/antigravity-ide/brain/50b58649-3ae0-4117-ae03-eadb52387070';

    // Capture Stats section specifically
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('home-stats-section');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const statsShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/hp_stats_section.png`, Buffer.from(statsShot.data, 'base64'));
    console.log('Saved hp_stats_section.png');

    // Capture Cloud vs Sandbox section specifically
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('cloud-vs-tooldesk');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const archShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/hp_cloud_vs_sandbox.png`, Buffer.from(archShot.data, 'base64'));
    console.log('Saved hp_cloud_vs_sandbox.png');

    // Capture Reviews section specifically
    await send('Runtime.evaluate', {
      expression: `
        const el = document.querySelector('.tooldesk-reviews-grid') || document.querySelector('section:has(.tooldesk-reviews-grid)');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const revShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/hp_reviews_section.png`, Buffer.from(revShot.data, 'base64'));
    console.log('Saved hp_reviews_section.png');

    // Capture FAQ & CTA section specifically
    await send('Runtime.evaluate', {
      expression: `
        window.scrollTo({ top: document.body.scrollHeight - 1600, behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const faqShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/hp_faq_cta_section.png`, Buffer.from(faqShot.data, 'base64'));
    console.log('Saved hp_faq_cta_section.png');

    // Capture Footer specifically
    await send('Runtime.evaluate', {
      expression: `
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 1000));
    const footerShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/hp_footer_section.png`, Buffer.from(footerShot.data, 'base64'));
    console.log('Saved hp_footer_section.png');

    // Mobile viewport verification (375x812)
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('cloud-vs-tooldesk');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    const mobArchShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/hp_mobile_cloud_vs_sandbox.png`, Buffer.from(mobArchShot.data, 'base64'));
    console.log('Saved hp_mobile_cloud_vs_sandbox.png');

    ws.close();
    chrome.kill();
    console.log('ALL HOMEPAGE SECTIONS CAPTURED SUCCESSFULLY');
  } catch (e) {
    console.error('Capture error:', e);
    chrome.kill();
    process.exit(1);
  }
}

capture();
