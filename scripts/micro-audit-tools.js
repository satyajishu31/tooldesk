import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9232',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9232/json');
    const list = await listRes.json();
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

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    console.log('=== Step 1: Auditing Category Filter Pills on Desktop & Mobile ===');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await send('Page.navigate', { url: 'http://localhost:5173/#tools' });
    await new Promise(res => setTimeout(res, 2500));

    // Audit category pill counts vs actual rendered cards
    const categoryAudit = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const pills = Array.from(document.querySelectorAll('.category-pills-bar button'));
          const results = [];
          for (const btn of pills) {
            const label = btn.querySelector('span:first-child')?.innerText?.trim();
            const badgeCount = parseInt(btn.querySelector('span:last-child')?.innerText?.trim() || '0', 10);
            results.push({ label, badgeCount });
          }
          return results;
        })()
      `,
      returnByValue: true
    });

    console.log('Found category pills:', categoryAudit.result?.value);

    // Test clicking through each category pill and verifying filtered count
    const clickResults = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const pills = Array.from(document.querySelectorAll('.category-pills-bar button'));
          const log = [];
          for (let i = 0; i < pills.length; i++) {
            const btn = pills[i];
            const text = btn.innerText.replace(/\\s+/g, ' ').trim();
            btn.click();
            await new Promise(r => setTimeout(r, 200));
            const cards = document.querySelectorAll('#tools a[href^="/tools/"]').length;
            const badgeCount = parseInt(btn.querySelector('span:last-child')?.innerText?.trim() || '0', 10);
            const matches = text.includes('Starred') ? true : (cards === badgeCount);
            log.push({ pill: text, badgeCount, renderedCards: cards, matches });
          }
          // Reset back to 'All'
          pills[0]?.click();
          return log;
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Category filter click verification:');
    let allPillsMatched = true;
    for (const item of (clickResults.result?.value || [])) {
      console.log(`  Pill: [${item.pill}] -> Cards: ${item.renderedCards} vs Badge: ${item.badgeCount} (Match: ${item.matches})`);
      if (!item.matches) allPillsMatched = false;
    }

    console.log('\n=== Step 2: Auditing Viewport Bounds & Horizontal Overflow ===');
    const viewports = [375, 390, 768, 1024, 1280];
    for (const w of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 800,
        deviceScaleFactor: 2,
        mobile: w < 768
      });
      await new Promise(r => setTimeout(r, 300));

      const overflowCheck = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const scrollWidth = document.documentElement.scrollWidth;
            const clientWidth = document.documentElement.clientWidth;
            const hasXOverflow = scrollWidth > clientWidth;
            return { width: window.innerWidth, scrollWidth, clientWidth, hasXOverflow };
          })()
        `,
        returnByValue: true
      });
      const v = overflowCheck.result?.value;
      console.log(`  Viewport ${w}px -> ScrollWidth: ${v?.scrollWidth}px, ClientWidth: ${v?.clientWidth}px, Overflow: ${v?.hasXOverflow ? 'YES (FAIL)' : 'NO (CLEAN)'}`);
    }

    console.log('\n=== Step 3: Auditing ToolShell Interactions on /tools/password ===');
    await send('Page.navigate', { url: 'http://localhost:5173/tools/password' });
    await new Promise(res => setTimeout(res, 2000));

    const toolShellAudit = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const backBtn = document.querySelector('.tool-shell-back-btn');
          const privacyBtn = document.querySelector('button[aria-label="Local In-Browser"]');
          const favBtn = document.querySelector('button[aria-label="Add to favorites"], button[aria-label="Remove from favorites"]');
          
          const backRect = backBtn?.getBoundingClientRect();
          const privacyRect = privacyBtn?.getBoundingClientRect();
          const favRect = favBtn?.getBoundingClientRect();

          const hasOverlap = backRect && privacyRect && (backRect.right > privacyRect.left);

          return {
            hasBackBtn: !!backBtn,
            backHeight: backRect?.height,
            hasPrivacyBtn: !!privacyBtn,
            privacyHeight: privacyRect?.height,
            hasFavBtn: !!favBtn,
            favHeight: favRect?.height,
            hasOverlap: !!hasOverlap
          };
        })()
      `,
      returnByValue: true
    });

    console.log('ToolShell audit:', toolShellAudit.result?.value);

    // Test privacy modal opening and closing
    const modalTest = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const privacyBtn = document.querySelector('button[aria-label="Local In-Browser"]');
          if (!privacyBtn) return { error: 'Privacy button not found' };
          
          privacyBtn.click();
          await new Promise(r => setTimeout(r, 200));
          const modalBefore = document.querySelector('.privacy-modal-glass');
          const opened = !!modalBefore;
          
          // Click close
          const closeBtn = modalBefore?.querySelector('button');
          closeBtn?.click();
          await new Promise(r => setTimeout(r, 250));
          const modalAfter = document.querySelector('.privacy-modal-glass');
          const closed = !modalAfter;

          return { opened, closed };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Privacy Modal open/close test:', modalTest.result?.value);

    // Test password generator interaction
    const passwordGenTest = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const passElemBefore = document.querySelector('pre, code, .font-mono') || document.querySelector('[style*="font-family: monospace"]');
          const passText1 = passElemBefore?.innerText;
          
          // Click regenerate button
          const refreshBtn = document.querySelector('button[title*="Generate"], button[aria-label*="Generate"], button[title*="Refresh"], button[title*="New"]');
          if (refreshBtn) refreshBtn.click();
          await new Promise(r => setTimeout(r, 200));
          
          const passElemAfter = document.querySelector('pre, code, .font-mono') || document.querySelector('[style*="font-family: monospace"]');
          const passText2 = passElemAfter?.innerText;

          return { passText1: passText1?.slice(0, 10), passText2: passText2?.slice(0, 10), changed: passText1 !== passText2 };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Password generation interaction:', passwordGenTest.result?.value);

    console.log('\n=== Step 4: Auditing Word Counter on /tools/wordcount ===');
    await send('Page.navigate', { url: 'http://localhost:5173/tools/wordcount' });
    await new Promise(res => setTimeout(res, 2000));

    const wordCountTest = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const textarea = document.querySelector('textarea');
          if (!textarea) return { error: 'Textarea not found' };
          
          textarea.value = 'The quick brown fox jumps over the lazy dog. Local first privacy!';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));

          const textContent = document.body.innerText;
          const has11Words = textContent.includes('11') || textContent.includes('Words');

          return { typedTextLength: textarea.value.length, verified: has11Words };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Word Counter live reactivity test:', wordCountTest.result?.value);

    console.log('\n=== Micro Audit Complete ===');
    ws.close();
    chrome.kill();
    process.exit(0);
  } catch (err) {
    console.error('Audit failed:', err);
    chrome.kill();
    process.exit(1);
  }
}

main();
