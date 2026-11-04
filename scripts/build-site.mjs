#!/usr/bin/env node
// Static catalog HTML: accessible without JavaScript; the client only filters it.
import { readFileSync, writeFileSync } from 'node:fs';
const themes = JSON.parse(readFileSync(new URL('../skills/slopless/references/themes/index.json', import.meta.url))).themes;
const esc = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const genres = { editorial: 'Editorial', 'modern-minimal': 'Minimal', atmospheric: 'Atmospheric', playful: 'Playful' };
const featured = ['studio', 'cobalt', 'ribbon', 'atelier', 'kiln', 'hedgerow'];
themes.sort((a,b) => (featured.indexOf(a.slug) < 0 ? 100 : featured.indexOf(a.slug)) - (featured.indexOf(b.slug) < 0 ? 100 : featured.indexOf(b.slug)) || a.name.localeCompare(b.name));
const html = themes.map(t => `        <article class="theme-card" data-material="${esc(t.slug)}" data-name="${esc(t.name)}" data-genre="${esc(t.genre)}" data-search="${esc([t.name,t.genre,t.material,...t.keywords].join(' ').toLowerCase())}" data-description="${esc(t.material)}">
          <div class="theme-shot"><a href="themes/${esc(t.slug)}/" aria-label="Open ${esc(t.name)} live example"><img src="assets/themes/${esc(t.slug)}.webp" width="400" height="250" loading="lazy" alt="${esc(t.name)} design material example"></a><button type="button" class="theme-preview" data-preview aria-label="Preview ${esc(t.name)}" hidden>Preview ↗</button></div>
          <div class="theme-card-top"><h3><a href="themes/${esc(t.slug)}/">${esc(t.name)}</a></h3><span class="genre-tag">${esc(genres[t.genre] || t.genre)}</span></div><p>${esc(t.material.charAt(0).toUpperCase()+t.material.slice(1))}.</p>
        </article>`).join('\n');
const file = new URL('../site/index.html', import.meta.url);
const source = readFileSync(file,'utf8');
const result = source.replace(/<!-- CATALOG:START -->[\s\S]*?<!-- CATALOG:END -->/, `<!-- CATALOG:START -->\n${html}\n<!-- CATALOG:END -->`);
if (process.argv.includes('--check')) {
  if (result !== source) { console.error('Catalog HTML is stale. Run node scripts/build-site.mjs'); process.exit(1); }
} else writeFileSync(file,result);
console.log(`Catalog: ${themes.length} materials, ${process.argv.includes('--check') ? 'current' : 'built'}.`);
