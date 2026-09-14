// 臨時編輯定稿腳本：把 edits.json 烘焙進 index.html 的 stopsData，下次 commit 即定稿。
// 用法：
//   node scripts/apply-edits.mjs            # 套用 edits.json → 改寫 index.html，並清空 edits.json
//   node scripts/apply-edits.mjs --dry-run  # 只顯示會改什麼，不寫檔
// edits.json 格式：{ "<stop_id>": { "name": "...", "lat": 24.x, "lng": 118.x, "updatedAt": "..." } }
// 只處理 name / lat / lng 三個欄位，其餘（照片、時間、命名輪次）不動。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const editsPath = join(root, 'edits.json');
const htmlPath = join(root, 'index.html');
const dryRun = process.argv.includes('--dry-run');

function loadEdits() {
  if (!existsSync(editsPath)) return {};
  const raw = readFileSync(editsPath, 'utf8').trim() || '{}';
  const o = JSON.parse(raw);
  return o && typeof o === 'object' ? o : {};
}

// 切出 stop_id=N 之後、到下一個 stop_id 出現之前的區段，在區段內做欄位替換。
function patchStopBlock(html, stopId, edit) {
  const anchor = `stop_id: ${stopId},`;
  const start = html.indexOf(anchor);
  if (start === -1) return { html, changed: [] };
  const nextAnchorIdx = html.indexOf('stop_id: ', start + anchor.length);
  const end = nextAnchorIdx === -1 ? html.indexOf('];', start) : nextAnchorIdx;
  let block = html.slice(start, end);
  const changed = [];
  if (typeof edit.name === 'string' && edit.name.trim()) {
    const re = /name:\s*"((?:[^"\\]|\\.)*)"/;
    if (re.test(block)) {
      block = block.replace(re, () => `name: ${JSON.stringify(edit.name.trim())}`);
      changed.push(`name=${JSON.stringify(edit.name.trim())}`);
    }
  }
  if (Number.isFinite(edit.lat) && Number.isFinite(edit.lng)) {
    if (/lat:\s*-?\d+(\.\d+)?/.test(block) && /lng:\s*-?\d+(\.\d+)?/.test(block)) {
      block = block
        .replace(/lat:\s*-?\d+(\.\d+)?/, `lat: ${edit.lat}`)
        .replace(/lng:\s*-?\d+(\.\d+)?/, `lng: ${edit.lng}`);
      changed.push(`lat=${edit.lat} lng=${edit.lng}`);
    }
  }
  if (!changed.length) return { html, changed };
  return { html: html.slice(0, start) + block + html.slice(end), changed };
}

const edits = loadEdits();
const ids = Object.keys(edits).filter((k) => /^\d+$/.test(k)).sort((a, b) => +a - +b);
if (!ids.length) {
  console.log('edits.json 無待定稿編輯，不需處理。');
  process.exit(0);
}

let html = readFileSync(htmlPath, 'utf8');
const report = [];
for (const id of ids) {
  const { html: next, changed } = patchStopBlock(html, Number(id), edits[id]);
  html = next;
  report.push(changed.length ? `#${id}: ${changed.join(', ')}` : `#${id}: 無對應欄位（略過）`);
}

console.log(`待定稿 ${ids.length} 站：\n` + report.map((r) => `  - ${r}`).join('\n'));
if (dryRun) {
  console.log('\n[dry-run] 未寫檔。確認無誤後執行：node scripts/apply-edits.mjs');
  process.exit(0);
}

writeFileSync(htmlPath, html);
writeFileSync(editsPath, '{}\n');
console.log('\n已寫入 index.html，並清空 edits.json。請檢查 diff 後 commit 定稿。');
