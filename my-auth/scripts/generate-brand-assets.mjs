// Build-time vector rendering only; not imported by the application runtime.
// Run: node my-auth/scripts/generate-brand-assets.mjs [--chrome PATH] [--scratch PATH]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'static', 'branding', 'zhima');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const chrome = option('--chrome') || process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(file => fs.existsSync(file));
if (!chrome || !fs.existsSync(chrome)) throw new Error('Pass --chrome with an installed Chrome executable.');
const scratch = option('--scratch') || path.join(os.tmpdir(), 'zhima-brand-render');
fs.mkdirSync(scratch, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const mark = fs.readFileSync(path.join(output, 'mark.svg'), 'utf8');
const body = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const square = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 128 128"><rect width="128" height="128" fill="#eee8f7"/>${body}</svg>`;
fs.writeFileSync(path.join(output, 'icon.svg'), square + '\n');
const assets = [72, 96, 144, 192, 256, 384, 512, 1024].map(size => ({ name: `icon-${size}`, width: size, height: size, svg: square }));
assets.push({ name: 'mark-96', width: 96, height: 96, svg: mark }, { name: 'mark-192', width: 192, height: 192, svg: mark });
for (const [density, width, height] of [['hdpi', 480, 762], ['xhdpi', 720, 1242], ['xxhdpi', 1080, 1882]]) {
  const innerW = width - 2, innerH = height - 2, scale = innerW / 480;
  const cx = innerW / 2, cy = innerH * .45, logoSize = 112 * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}" viewBox="0 0 ${innerW} ${innerH}"><rect width="100%" height="100%" fill="#f7f7f2"/><svg x="${cx - logoSize / 2}" y="${cy - logoSize / 2}" width="${logoSize}" height="${logoSize}" viewBox="16 16 96 96">${body}</svg><text x="${cx}" y="${cy + 99 * scale}" text-anchor="middle" fill="#302d35" font-family="Microsoft YaHei UI,Microsoft YaHei,sans-serif" font-size="${32 * scale}" font-weight="700" letter-spacing="${5 * scale}">芝码</text><text x="${cx}" y="${cy + 133 * scale}" text-anchor="middle" fill="#777474" font-family="Microsoft YaHei UI,Microsoft YaHei,sans-serif" font-size="${14 * scale}">芝麻开门，验证码就绪。</text></svg>`;
  assets.push({ name: `splash-${density}.9`, width, height, svg, ninePatch: true, scale, cy });
}

const profile = path.join(scratch, 'chrome-' + Date.now());
const child = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const checks = [];
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; if (port) break; } catch (_) {}
    await pause(100);
  }
  if (!port) throw new Error('Chrome renderer did not start.');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let serial = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  for (const asset of assets) {
    const { width, height } = asset;
    const source = 'data:image/svg+xml;base64,' + Buffer.from(asset.svg).toString('base64');
    const result = await rpc('Runtime.evaluate', {
      expression: `(async () => {
        const source = new Image(); source.src = ${JSON.stringify(source)}; await source.decode();
        const canvas = document.createElement('canvas'); canvas.width = ${width}; canvas.height = ${height};
        const context = canvas.getContext('2d');
        const border = ${asset.ninePatch ? 1 : 0};
        // Explicit destination dimensions prevent the old top-left-only crop bug.
        context.drawImage(source, border, border, canvas.width - border * 2, canvas.height - border * 2);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let purple = 0, minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
        for (let y = border; y < canvas.height - border; y++) for (let x = border; x < canvas.width - border; x++) {
          const at = (y * canvas.width + x) * 4;
          if (pixels[at + 3] > 200 && pixels[at] < 195 && pixels[at + 2] > pixels[at + 1] + 10) {
            purple++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
        if (purple < canvas.width * canvas.height * .004 || minX <= border || minY <= border || maxX >= canvas.width - border - 1 || maxY >= canvas.height - border - 1) throw Error('Blank or clipped brand asset');
        if (${!!asset.ninePatch}) {
          context.fillStyle = '#000';
          // Only blank margins stretch; the central logo and typesetting stay intact.
          context.fillRect(1, 0, Math.floor(canvas.width * .20), 1);
          context.fillRect(Math.ceil(canvas.width * .80), 0, canvas.width - Math.ceil(canvas.width * .80) - 1, 1);
          const top = Math.floor(${asset.cy || 0} - 76 * ${asset.scale || 1});
          const bottom = Math.ceil(${asset.cy || 0} + 155 * ${asset.scale || 1});
          context.fillRect(0, 1, 1, top - 1); context.fillRect(0, bottom, 1, canvas.height - bottom - 1);
          context.fillRect(1, canvas.height - 1, canvas.width - 2, 1); context.fillRect(canvas.width - 1, 1, 1, canvas.height - 2);
        }
        return { png: canvas.toDataURL('image/png').split(',')[1], purple, bounds: [minX, minY, maxX, maxY] };
      })()`, awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(asset.name + ': ' + JSON.stringify(result.exceptionDetails));
    const { png, purple, bounds } = result.result.value;
    fs.writeFileSync(path.join(output, asset.name + '.png'), Buffer.from(png, 'base64'));
    checks.push({ file: asset.name + '.png', width, height, purplePixels: purple, bounds, ninePatch: !!asset.ninePatch });
  }
  fs.writeFileSync(path.join(scratch, 'asset-checks.json'), JSON.stringify(checks, null, 2));
  console.log(`Rendered and checked ${checks.length} brand PNGs. Report: ${path.join(scratch, 'asset-checks.json')}`);
  await rpc('Browser.close');
} finally { try { socket?.close(); } catch (_) {} try { child.kill(); } catch (_) {} }
