// Tiny headless-Edge driver over the Chrome DevTools Protocol (dev-only test helper, not part of the game).
// usage: node .superpowers/cdp.mjs <scenario.mjs>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const profile = path.resolve('.superpowers/edge-profile');
mkdirSync(profile, { recursive: true });
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.find(t => t.type === 'page')) break; } catch {} await sleep(250); }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');

const KEYS = { KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], Space: [' ', 32], Escape: ['Escape', 27], ControlLeft: ['Control', 17], F9: ['F9', 120] };
const api = {
  send,
  sleep,
  logs,
  async goto(url) { await send('Page.navigate', { url }); await sleep(500); },
  async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; },
  async key(code, type) { const [key, kc] = KEYS[code]; await send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: kc, text: type === 'keyDown' && key.length === 1 ? key : undefined }); },
  async hold(code, ms) { await api.key(code, 'keyDown'); await sleep(ms); await api.key(code, 'keyUp'); },
  async tap(code) { await api.hold(code, 60); },
  async click(x, y) { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); },
  async move(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); },
  async shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.resolve('.superpowers/shots', name + '.png');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  },
};

try {
  const scenario = await import(pathToFileURL(path.resolve(process.argv[2])).href);
  await scenario.default(api);
} catch (e) { console.log('SCENARIO ERROR', e); }
console.log('--- page console ---\n' + logs.slice(-40).join('\n'));
ws.close();
proc.kill();
process.exit(0);
