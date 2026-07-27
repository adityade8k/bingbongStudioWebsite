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

function evaluate(expression) {
  const requestId = ++id;
  socket.send(JSON.stringify({
    id: requestId,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true }
  }));
  return new Promise((resolve) => pending.set(requestId, (message) => {
    if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.text);
    resolve(message.result?.result?.value);
  }));
}

function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve) => pending.set(requestId, resolve));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
await command('Page.bringToFront');
await evaluate(`location.reload()`);
await wait(1500);
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (await evaluate(`document.querySelector('#loader').classList.contains('is-done')`)) break;
  await wait(500);
}

const sectionCount = await evaluate(`document.querySelectorAll('main > [data-scene]').length`);
const metrics = await evaluate(`({
  viewport: innerHeight,
  maximum: document.documentElement.scrollHeight - innerHeight
})`);
const downward = [];
for (let y = 0; y < metrics.maximum; y += metrics.viewport / 4) downward.push(y);
downward.push(metrics.maximum);
const orders = [downward, [...downward].reverse(), downward];
const results = [];

for (const direction of orders) {
  for (const y of direction) {
    await evaluate(`scrollTo({top:${y}, behavior:'instant'})`);
    await wait(400);
    results.push(await evaluate(`(() => {
      const stage = document.querySelector('#stage');
      const sections = [...document.querySelectorAll('main > [data-scene]')];
      const expectedSection = sections.reduce((best, panel) => {
        const rect = panel.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
        return !best || visible > best.visible ? { panel, visible } : best;
      }, null).panel;
      return {
        scrollY: Math.round(scrollY),
        expected: expectedSection.dataset.scene,
        active: stage.dataset.scene,
        models: stage.dataset.models || 'none',
        scaleFinite: stage.dataset.scaleFinite === 'true',
        loaderDone: document.querySelector('#loader').classList.contains('is-done')
      };
    })()`));
  }
}

socket.close();
console.log(JSON.stringify(results, null, 2));

const failures = results.filter(({ expected, active, models, loaderDone, scaleFinite }) => {
  if (!loaderDone || !scaleFinite || expected !== active) return true;
  if (expected === 'none') return models !== 'none';
  if (expected === 'ensemble') {
    return !['looper', 'horn', 'branch'].every((name) => models.split(',').includes(name));
  }
  return !models.split(',').includes(expected);
});
if (failures.length) {
  console.error('Scroll regression failures:', JSON.stringify(failures, null, 2));
  process.exit(1);
}
