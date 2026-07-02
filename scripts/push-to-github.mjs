#!/usr/bin/env node
/**
 * Pushes the Kuula project to GitHub via the Git Data API.
 * Usage:
 *   node push-to-github.mjs --blobs START END OUTFILE   (create blob batch)
 *   node push-to-github.mjs --finalize BLOB_FILE...     (create tree+commit+ref)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const OWNER = 'jolems123';
const REPO  = 'Kuula';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN not set'); process.exit(1); }

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent': 'Kuula-Push',
};

async function api(endpoint, method = 'GET', body = null) {
  const url = endpoint.startsWith('http') ? endpoint : `${API}${endpoint}`;
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    const msg = JSON.stringify(data).replace(new RegExp(TOKEN, 'g'), '***');
    throw new Error(`${method} ${endpoint} → ${res.status}: ${msg.slice(0,400)}`);
  }
  return data;
}

// ── File scanner ──────────────────────────────────────────────────────────────
const BASE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SKIP_DIRS    = new Set(['node_modules','.git','dist','dist-ssr','.cache',
                               '.local','.agents','.upm','.config']);
const SKIP_ANDROID = new Set(['.gradle','build']);
const SKIP_IOS     = new Set(['Pods','DerivedData']);
const SKIP_RX = [
  /^\.env(\.|$)/i, /\.DS_Store$/, /Thumbs\.db$/i,
  /\.swp$/, /\.log$/, /local\.properties$/,
  /xcuserdata/, /xcworkspace\/xcuserdata/,
];

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel  = relative(BASE, full);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (rel.startsWith('android/') && SKIP_ANDROID.has(e.name)) continue;
      if (rel.startsWith('ios/')     && SKIP_IOS.has(e.name))     continue;
      walk(full, out);
    } else {
      if (SKIP_RX.some(rx => rx.test(rel) || rx.test(e.name))) continue;
      try {
        const { size } = statSync(full);
        if (size > 3 * 1024 * 1024) { console.log('SKIP_LARGE:', rel); continue; }
        out.push({ path: rel, fullPath: full, size });
      } catch { /* ignore */ }
    }
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createBlob(file) {
  const buf = readFileSync(file.fullPath);
  const binary  = isBinary(buf);
  const content  = binary ? buf.toString('base64') : buf.toString('utf-8');
  const encoding = binary ? 'base64' : 'utf-8';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { sha } = await api('/git/blobs', 'POST', { content, encoding });
      return { path: file.path, mode: '100644', type: 'blob', sha };
    } catch (err) {
      if (attempt === 4) throw err;
      const wait = attempt * 20000;
      console.log(`  retry ${attempt} for ${file.path} in ${wait/1000}s…`);
      await sleep(wait);
    }
  }
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args[0] === '--blobs') {
  // --blobs START END OUTFILE
  const [, startArg, endArg, outFile] = args;
  const files = walk(BASE);
  const start = parseInt(startArg, 10);
  const end   = Math.min(parseInt(endArg, 10), files.length);
  const batch = files.slice(start, end);
  console.log(`Blob batch ${start}–${end-1} (${batch.length} files) → ${outFile}`);
  const results = [];
  for (let i = 0; i < batch.length; i++) {
    const item = await createBlob(batch[i]);
    results.push(item);
    await sleep(300);
    if ((i + 1) % 20 === 0 || i === batch.length - 1)
      console.log(`  ${start + i + 1}/${files.length}`);
  }
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`✅ saved ${results.length} blobs to ${outFile}`);

} else if (args[0] === '--finalize') {
  // --finalize BLOB_FILE1 BLOB_FILE2 ...
  const blobFiles = args.slice(1);
  const treeItems = blobFiles.flatMap(f => JSON.parse(readFileSync(f, 'utf-8')));
  console.log(`Finalizing: ${treeItems.length} blobs loaded`);

  console.log('Creating tree…');
  const { sha: treeSha } = await api('/git/trees', 'POST', { tree: treeItems });
  console.log('  tree:', treeSha);

  console.log('Creating commit…');
  const { sha: commitSha } = await api('/git/commits', 'POST', {
    message: 'feat: Kuula — full Ugandan fintech app\n\n' +
             'React + Vite + TypeScript PWA · Capacitor iOS/Android\n' +
             'Supabase + MarzPay · i18n en/lg/sw · 191 screens',
    tree: treeSha,
    parents: [],
  });
  console.log('  commit:', commitSha);

  console.log('Updating main branch…');
  await api('/git/refs/heads/main', 'PATCH', { sha: commitSha, force: true });
  console.log(`\n🎉 Done! https://github.com/${OWNER}/${REPO}`);

} else {
  const files = walk(BASE);
  console.log(`${files.length} files · ${(files.reduce((s,f)=>s+f.size,0)/1024/1024).toFixed(2)} MB`);
  console.log('Usage:');
  console.log('  node push-to-github.mjs --blobs START END OUTFILE');
  console.log('  node push-to-github.mjs --finalize BLOB1.json BLOB2.json ...');
}
