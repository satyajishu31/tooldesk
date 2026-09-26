import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

const VIEWPORTS = [
  { width: 360, height: 800, label: '360px_android_compact' },
  { width: 375, height: 812, label: '375px_iphone_standard' },
  { width: 390, height: 844, label: '390px_iphone14' },
];

async function runVerification() {
  console.log('--- STARTING FORENSIC RE-VALIDATION VIA CHROME CDP ---');
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9244',
    '--disable-gpu',
    '--no-sandbox'
  ]);
  await new Promise(r => setTimeout(r, 2000));

  try {
    const list = await (await fetch('http://127.0.0.1:9244/json')).json();
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

    const testResults = [];

    for (const vp of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: true
      });

      // 1. TEST HOME HERO & SECTION 2
      await send('Page.navigate', { url: 'http://localhost:4173/' });
      await new Promise(r => setTimeout(r, 1200));

      const heroCheck = await evaluate(`(() => {
        const h1 = document.querySelector('.hero-h1');
        const sec2 = document.querySelector('h2');
        const h1Rect = h1 ? h1.getBoundingClientRect() : null;
        const sec2Rect = sec2 ? sec2.getBoundingClientRect() : null;
        return {
          h1Width: h1Rect?.width,
          h1Right: h1Rect?.right,
          h1Overflows: h1 ? (h1.scrollWidth > h1.clientWidth + 2) : false,
          sec2Width: sec2Rect?.width,
          sec2Right: sec2Rect?.right,
          sec2Overflows: sec2 ? (sec2.scrollWidth > sec2.clientWidth + 2) : false,
          bodyOverflowX: document.documentElement.scrollWidth > window.innerWidth,
          windowWidth: window.innerWidth
        };
      })()`);

      testResults.push({
        test: 'Home Typography & Overflow',
        viewport: vp.label,
        ...heroCheck
      });

      // Capture screenshot of Home
      const shotHome = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`verified_home_${vp.label}.png`, Buffer.from(shotHome.data, 'base64'));

      // 2. TEST IMAGE TOOLS STUDIO (Header collision + Option cards + Tool Icon)
      await send('Page.navigate', { url: 'http://localhost:4173/tools/image-tools' });
      await new Promise(r => setTimeout(r, 1200));

      const imgStudioCheck = await evaluate(`(() => {
        const backBtn = document.querySelector('.tool-shell-back-btn') || document.querySelector('a[aria-label="Back to all tools"]');
        const rightControls = document.querySelectorAll('button[title*="Data handling"], button[title*="favorite"]');
        const backRect = backBtn ? backBtn.getBoundingClientRect() : null;
        
        let rightEdgeOfBack = backRect ? backRect.right : 0;
        let leftEdgeOfRight = 999999;
        rightControls.forEach(btn => {
          const r = btn.getBoundingClientRect();
          if (r.left < leftEdgeOfRight) leftEdgeOfRight = r.left;
        });

        const overlapDistance = rightEdgeOfBack - leftEdgeOfRight;
        const hasHeaderCollision = overlapDistance > 0;

        // Check cards horizontal cut-off
        const cards = Array.from(document.querySelectorAll('.image-studio-tab-item'));
        const cutOffCards = cards.filter(c => {
          const r = c.getBoundingClientRect();
          return r.right > window.innerWidth + 2 || r.left < -2;
        });

        // Check tool header icon
        const iconImg = document.querySelector('.tool-shell img');
        const iconLoaded = iconImg ? (iconImg.complete && iconImg.naturalWidth > 0) : false;

        return {
          windowWidth: window.innerWidth,
          rightEdgeOfBack,
          leftEdgeOfRight,
          headerSpacingGap: leftEdgeOfRight - rightEdgeOfBack,
          hasHeaderCollision,
          totalCards: cards.length,
          cutOffCardsCount: cutOffCards.length,
          iconLoaded
        };
      })()`);

      testResults.push({
        test: 'Image Tools Studio Layout & Header',
        viewport: vp.label,
        ...imgStudioCheck
      });

      const shotStudio = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`verified_imagetools_${vp.label}.png`, Buffer.from(shotStudio.data, 'base64'));

      // 3. TEST CURRENCY CONVERTER
      await send('Page.navigate', { url: 'http://localhost:4173/tools/currency' });
      await new Promise(r => setTimeout(r, 1200));

      const currCheck = await evaluate(`(() => {
        const textNodes = document.body.innerText;
        const hasDummyGbp = textNodes.includes('1 GBP = 0.79 JPY') || textNodes.includes('1 INR = 83.1 GBP');
        const hasRealisticPair = textNodes.includes('1 GBP = 194.5 JPY') || textNodes.includes('1 USD = 0.92 EUR') || textNodes.includes('1 EUR = 0.86 GBP') || textNodes.includes('1 USD = 83.5 INR');
        
        const backBtn = document.querySelector('.tool-shell-back-btn') || document.querySelector('a[aria-label="Back to all tools"]');
        const rightControls = document.querySelectorAll('button[title*="Data handling"], button[title*="favorite"]');
        const backRect = backBtn ? backBtn.getBoundingClientRect() : null;
        let leftEdgeOfRight = 999999;
        rightControls.forEach(btn => {
          const r = btn.getBoundingClientRect();
          if (r.left < leftEdgeOfRight) leftEdgeOfRight = r.left;
        });
        const headerSpacingGap = backRect ? leftEdgeOfRight - backRect.right : 0;

        return {
          hasDummyGbp,
          hasRealisticPair,
          headerSpacingGap,
          hasCollision: headerSpacingGap < 0
        };
      })()`);

      testResults.push({
        test: 'Currency Animation & Header',
        viewport: vp.label,
        ...currCheck
      });

      const shotCurr = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`verified_currency_${vp.label}.png`, Buffer.from(shotCurr.data, 'base64'));
    }

    console.log('\n--- VERIFICATION TEST MATRIX RESULTS ---');
    console.table(testResults);

    ws.close();
    chrome.kill();
  } catch (err) {
    console.error('Error during verification:', err);
    chrome.kill();
  }
}

runVerification();
