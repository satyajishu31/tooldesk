import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';

const PATHS = [
  '/tools/imgcompress',
  '/tools/imgresizer',
  '/tools/imgconvert',
  '/tools/password',
  '/tools/pdf',
  '/tools/image-tools',
  '/tools/qrcode',
  '/tools/website-analyzer'
];

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9227/json');
    const list = await listRes.json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));

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

    console.log('=== INSPECTING TOOL CONTROLS AT 375px & 320px ===');

    for (const w of [375, 320]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 850,
        deviceScaleFactor: 2,
        mobile: true
      });

      for (const p of PATHS) {
        await send('Page.navigate', { url: `http://localhost:4173${p}` });
        await new Promise(r => setTimeout(r, 1400));

        const evalRes = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const issues = [];
              const all = document.querySelectorAll('*');
              for (const el of all) {
                // Check if element has horizontal scroll or clips its content
                if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !['html','body','#root'].includes(el.tagName.toLowerCase())) {
                  const style = window.getComputedStyle(el);
                  if (style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
                    issues.push({
                      type: 'INNER_CLIPPING',
                      tag: el.tagName,
                      cls: (el.className || '').toString().slice(0, 30),
                      scrollWidth: el.scrollWidth,
                      clientWidth: el.clientWidth,
                      diff: el.scrollWidth - el.clientWidth,
                      text: (el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')
                    });
                  }
                }

                // Check for squished grid/flex items (< 75px wide)
                if (el.children.length === 0 && (el.innerText || '').trim().length > 8) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width > 0 && rect.width < 75 && rect.height > 10) {
                    issues.push({
                      type: 'SQUISHED_TEXT',
                      tag: el.tagName,
                      width: Math.round(rect.width),
                      text: el.innerText.trim().slice(0, 30)
                    });
                  }
                }
              }
              return { issues: issues.slice(0, 6) };
            })()
          `,
          returnByValue: true
        });

        const issues = evalRes?.result?.value?.issues || [];
        console.log(`[Viewport ${w}px] Route: ${p.padEnd(24)} -> Issues found: ${issues.length}`);
        if (issues.length) {
          for (const iss of issues) {
            console.log(`   * ${iss.type}: ${iss.text || ''} (w: ${iss.width || iss.clientWidth}px, scroll: ${iss.scrollWidth || ''})`);
          }
        }

        // Take a screenshot of /tools/imgcompress and /tools/password at 375
        if (w === 375 && (p === '/tools/imgcompress' || p === '/tools/password' || p === '/tools/imgconvert')) {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          if (shot?.data) {
            fs.writeFileSync(`screenshot_${p.replace('/tools/', '')}_375.png`, Buffer.from(shot.data, 'base64'));
            console.log(`   Captured screenshot_${p.replace('/tools/', '')}_375.png`);
          }
        }
      }
    }

    ws.close();
    chrome.kill();
  } catch (err) {
    console.error('Inspection failed:', err);
    chrome.kill();
  }
}

main();
