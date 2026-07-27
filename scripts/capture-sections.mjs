import { writeFile } from 'node:fs/promises';

const targets = await fetch('http://127.0.0.1:9222/json').then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && target.url.includes('127.0.0.1:5173'));
if (!page) throw new Error('Local bingbong studio page was not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  pending.get(message.id)(message);
  pending.delete(message.id);
});
function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve) => pending.set(requestId, resolve));
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return response.result?.result?.value;
}
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await command('Page.bringToFront');
await evaluate(`location.reload()`);
await wait(1200);
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (await evaluate(`document.querySelector('#loader').classList.contains('is-done')`)) break;
  await wait(500);
}
await evaluate(`document.documentElement.style.scrollBehavior = 'auto'`);
const count = await evaluate(`document.querySelectorAll('main > [data-scene]').length`);
console.log(await evaluate(`({
  innerWidth,
  innerHeight,
  narrow: matchMedia('(max-width: 520px)').matches,
  controllerImageWidth: getComputedStyle(document.querySelector('.controllers__image')).width,
  controllerColumns: getComputedStyle(document.querySelector('.controllers')).gridTemplateColumns
})`));

for (let index = 0; index < count; index += 1) {
  await evaluate(`scrollTo(0, document.querySelectorAll('main > [data-scene]')[${index}].offsetTop)`);
  await wait(900);
  const response = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  });
  await writeFile(`/tmp/bingbong-mobile-section-${index}.png`, Buffer.from(response.result.data, 'base64'));
}
console.log('ensemble bounds', await evaluate(`document.querySelector('#stage').dataset.ensembleBounds`));
socket.close();
