import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const ROUTES_TO_TEST = [
  '/',
  '/tools/password',
  '/tools/wordcount',
  '/tools/textcase',
  '/tools/units',
  '/tools/currency',
  '/tools/gradient',
  '/tools/quote',
  '/tools/favicon',
  '/tools/thumbnail',
  '/tools/imgresizer',
  '/tools/imgcompress',
  '/tools/imgconvert',
  '/tools/bgremove',
  '/tools/pdf',
  '/tools/aspectratio',
  '/tools/fileconvert',
  '/tools/vault',
  '/tools/image-tools',
  '/tools/imgborder',
  '/tools/roundcorner',
  '/tools/randname',
  '/tools/randaddress',
  '/tools/wordreplace',
  '/tools/bcrypt',
  '/tools/colorpicker',
  '/tools/video-screenshot',
  '/tools/video-transcriber',
  '/tools/website-analyzer',
  '/tools/translator',
  '/tools/qrcode',
  '/tools/barcode',
  '/tools/qrscan',
  '/tools/breach-check',
  '/tools/ip-lookup',
  '/tools/system-info',
  '/tools/country-finder',
];

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--disable-gpu',
    '--no-sandbox'
  ]);
  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9229/json');
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

    await send('Console.enable');
    await send('Runtime.enable');

    let currentRoute = '';
    const routeErrors = new Map();

    ws.on('message', data => {
      const msg = JSON.parse(data);
      if (msg.method === 'Console.messageAdded' && msg.params.message.level === 'error') {
        const err = msg.params.message.text;
        // Ignore expected network fetch errors if testing backend without mock
        if (!routeErrors.has(currentRoute)) routeErrors.set(currentRoute, []);
        routeErrors.get(currentRoute).push('[CONSOLE ERROR] ' + err);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
        if (!routeErrors.has(currentRoute)) routeErrors.set(currentRoute, []);
        routeErrors.get(currentRoute).push('[EXCEPTION] ' + desc);
      }
    });

    console.log('Testing rendering of all ' + ROUTES_TO_TEST.length + ' routes in Chrome...');
    let passed = 0;
    let failed = 0;

    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    // Warm up dev server for dynamic imports
    await send('Page.navigate', { url: `${baseUrl}/` });
    await new Promise(res => setTimeout(res, 2500));

    for (const r of ROUTES_TO_TEST) {
      currentRoute = r;
      await send('Page.navigate', { url: `${baseUrl}${r}` });
      await new Promise(res => setTimeout(res, 1500));

      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const hasErrorBoundary = document.body.innerText.includes('Something went wrong') &&
                                     document.body.innerText.includes('This tool hit an unexpected error');
            const heading = document.querySelector('h1')?.innerText || document.querySelector('h2')?.innerText || '';
            const inputs = document.querySelectorAll('input, button, select, textarea').length;
            return { hasErrorBoundary, heading, inputs };
          })()
        `,
        returnByValue: true
      });

      const val = evalRes?.result?.value;
      const errors = routeErrors.get(r) || [];
      const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR_'));

      if (val?.hasErrorBoundary || criticalErrors.length > 0) {
        console.error(`  ✗ Route ${r.padEnd(26)} FAILED! ErrorBoundary: ${val?.hasErrorBoundary}, Errors:`, criticalErrors);
        failed++;
      } else {
        console.log(`  ✓ Route ${r.padEnd(26)} OK (Heading: "${val?.heading?.slice(0, 24)}", Controls: ${val?.inputs})`);
        passed++;
      }
    }

    console.log(`\nRendering summary: ${passed} passed, ${failed} failed.`);
    ws.close();
    chrome.kill();
    process.exit(failed > 0 ? 1 : 0);
  } catch(err) {
    console.error('Test runner failure:', err);
    chrome.kill();
    process.exit(1);
  }
}

main();
