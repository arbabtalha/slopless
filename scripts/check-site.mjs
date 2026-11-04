#!/usr/bin/env node
// Offline checks: all static pages and CSS assets, new-page anchors, brand/link regressions.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root,'site');
function walk(dir) {
  return readdirSync(dir,{ withFileTypes:true }).flatMap(e => {
    if (['.git','.cache','node_modules','.test-results'].includes(e.name)) return [];
    const p=join(dir,e.name);return e.isDirectory()?walk(p):[p];
  });
}
const files=walk(root);
const failures=[];
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"');
function targetFor(raw,file) {
  raw=decode(raw);
  if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(raw)) return null;
  const [path,hash] = raw.split('#');
  const clean=decodeURIComponent(path.split('?')[0]);
  const target=clean.startsWith('/')?join(site,clean.slice(1)):resolve(dirname(file),clean||'.');
  return { target:clean?target:file,hash };
}
const ownPages=new Set(['site/index.html','site/docs/index.html','site/credits/index.html','index.html']);
const html=files.filter(f=>f.endsWith('.html') && (f.startsWith(site) || dirname(f)===root));
for (const file of html) {
  const text=readFileSync(file,'utf8');
  const name=relative(root,file);
  for (const m of text.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']*)["']/gi)) {
    if (!m[1]) continue;
    let item;
    try {item=targetFor(m[1],file);} catch {failures.push(`${name}: invalid URL ${m[1]}`);continue;}
    if (!item) continue;
    if (!existsSync(item.target)) { failures.push(`${name}: missing ${m[1]}`);continue; }
    let target=item.target;
    if (statSync(target).isDirectory()) target=join(target,'index.html');
    if (!existsSync(target)) {failures.push(`${name}: no directory index ${m[1]}`);continue;}
    if (ownPages.has(name) && item.hash && target.endsWith('.html')) {
      const ids=[...readFileSync(target,'utf8').matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
      if (!ids.includes(item.hash)) failures.push(`${name}: missing anchor ${m[1]}`);
    }
  }
  if (ownPages.has(name)) {
    const ids=[...text.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
    if(new Set(ids).size!==ids.length) failures.push(`${name}: duplicate element id`);
    if (!/<html\s+lang="en"/.test(text)||!/<title>[^<]+<\/title>/.test(text)) failures.push(`${name}: missing language or title`);
    for(const m of text.matchAll(/<img\b[^>]*>/g)) if(!/\balt=/.test(m[0])) failures.push(`${name}: image lacks alt text`);
  }
}
for (const file of files.filter(f=>f.startsWith(site)&&f.endsWith('.css'))) {
  for (const m of readFileSync(file,'utf8').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/g)) {
    const value=m[1] ?? m[2] ?? m[3];
    const item=targetFor(value,file);
    if(item&&!existsSync(item.target)) failures.push(`${relative(root,file)}: missing CSS asset ${value}`);
  }
}
// An explicit allowlist prevents accidental leftovers while retaining provenance and compatibility.
const legacyAllowed=new Set(['LICENSE','NOTICE.md','.gitignore','skills/slopless/LICENSE','skills/slopless/NOTICE.md','site/credits/index.html','scripts/migrate.mjs','scripts/check-site.mjs','tests/integration.test.mjs','skills/slopless/scripts/sloplint.mjs','skills/slopless/scripts/capture.mjs','skills/slopless/scripts/capture.test.mjs','skills/slopless/scripts/picture.mjs','skills/slopless/scripts/sloplint-render.mjs','skills/slopless/scripts/sloplint-render.test.mjs','docs/REBRAND.md']);
for(const file of files) {
  const name=relative(root,file);
  if(!/\.(html|css|js|mjs|json|md|yaml|yml|py)$/.test(name)&&!['LICENSE','.gitignore'].includes(name)) continue;
  const text=readFileSync(file,'utf8');
  if(/hallmark|nutlope|usehallmark\.com/i.test(text)&&!legacyAllowed.has(name)) failures.push(`${name}: unapproved legacy branding`);
  if(name!=='scripts/check-site.mjs'&&/usehallmark\.com|x\.com\/(?:nutlope|YoussefUIUX)/i.test(text)) failures.push(`${name}: old promotional URL`);
}
const homepage=readFileSync(join(site,'index.html'),'utf8');
const themes=JSON.parse(readFileSync(join(root,'skills/slopless/references/themes/index.json'))).themes;
assert.equal((homepage.match(/data-material="/g)||[]).length,themes.length,'Catalog count');
for(const t of themes) {
  for(const p of [`themes/${t.slug}/index.html`,`assets/themes/${t.slug}.webp`,`assets/desk/${t.slug}.webp`]) if(!existsSync(join(site,p))) failures.push(`Catalog missing ${p}`);
}
for(const p of ['og-slopless.png','favicon.svg','favicon.ico','apple-touch-icon.png','sitemap.xml','robots.txt']) if(!existsSync(join(site,p))) failures.push(`Missing website metadata asset: ${p}`);
if(failures.length) {console.error(failures.join('\n'));process.exit(1);}
console.log(`Site check: ${html.length} HTML pages, ${themes.length} materials, CSS assets, new-page anchors and brand allowlist clean.`);
