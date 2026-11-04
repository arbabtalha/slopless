#!/usr/bin/env node
// Run from CI after Pages deployment. Public, read-only requests; no credentials.
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
const base='https://arbabtalha.github.io/slopless/site/';
const themes=JSON.parse(readFileSync(new URL('../skills/slopless/references/themes/index.json',import.meta.url))).themes;
const paths=['','docs/','credits/','style.css','js/app.js','favicon.svg','favicon.ico','apple-touch-icon.png','og-slopless.png','assets/fonts/manrope-latin.woff2','assets/fonts/plex-mono-latin.woff2',...themes.map(t=>`themes/${t.slug}/`),...readdirSync(new URL('../site/made/',import.meta.url)).map(s=>`made/${s}/`)];
let ready=false;
for(let attempt=0;attempt<8;attempt++) {
  try {
    const response=await fetch(base+`?health=${Date.now()}`,{signal:AbortSignal.timeout(15000)});
    const body=await response.text();
    ready=response.ok&&body.includes('Less default.')&&body.includes('data-material="studio"')&&body.includes('npx skills add arbabtalha/slopless -g');
    if(ready)break;
  }catch(error){console.log(`Waiting for Pages: ${error.message}`);}
  await setTimeout(5000);
}
if(!ready)throw new Error('The published homepage did not become ready. Check Pages deployment and CDN propagation.');
for(let start=0;start<paths.length;start+=6) {
  await Promise.all(paths.slice(start,start+6).map(async path=>{
    const response=await fetch(base+path,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}: ${base+path}`);
    const data=await response.arrayBuffer();
    if(!data.byteLength)throw new Error(`Empty public response: ${path}`);
    console.log(`OK ${response.status} ${path||'homepage'} (${data.byteLength} bytes)`);
  }));
}
const root=await fetch('https://arbabtalha.github.io/slopless/',{signal:AbortSignal.timeout(15000)});
if(!root.ok||!(await root.text()).includes('url=site/'))throw new Error('Project root does not forward to the Slopless site.');
console.log(`Public website healthy: ${paths.length} pages/assets plus the project-root entrypoint.`);
