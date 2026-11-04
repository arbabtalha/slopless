#!/usr/bin/env node
// Real-browser, local-only QA. Supply SLOPLESS_PUPPETEER (tools directory) and CHROME_PATH.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const req=createRequire(join(process.env.SLOPLESS_PUPPETEER || root,'noop.js'));
const { default: puppeteer }=await import(pathToFileURL(req.resolve('puppeteer-core')).href);
const axe=req.resolve('axe-core/axe.min.js');
const mime={ '.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain' };
const prefix='/slopless/site/';
const server=createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://test.local').pathname);
  if (!pathname.startsWith('/slopless/')) {response.writeHead(404).end();return;}
  let file=resolve(root,pathname.slice('/slopless/'.length));
  if(!file.startsWith(root+'/')) {response.writeHead(403).end();return;}
  if(existsSync(file)&&statSync(file).isDirectory())file=join(file,'index.html');
  if(!existsSync(file)) {response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});response.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
const errors=[];
const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log(`PASS ${name}`);};
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const page=await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(new URL(request.url()).origin===base||/^(data:|about:)/.test(request.url()))request.continue();
    else request.abort(); // Real demonstrations must not trigger provider calls during QA.
  });
  await page.goto(base+prefix,{waitUntil:'networkidle0'});
  await check('brand, six featured materials and all fifty static catalog entries',async()=>{
    assert.match(await page.title(),/Slopless/);
    assert.equal(await page.$$eval('[data-material]',els=>els.length),50);
    assert.equal(await page.$$eval('[data-material]:not([hidden])',els=>els.length),6);
  });
  await check('hero preview switches material and live destination',async()=>{
    await page.click('[data-hero="cobalt"]');
    assert.equal(await page.$eval('[data-hero-name]',el=>el.textContent),'Cobalt');
    assert.match(await page.$eval('[data-hero-link]',el=>el.href),/themes\/cobalt\/$/);
    await page.click('[data-hero="studio"]');
  });
  await check('genre filter, search, no-results reset and show-all',async()=>{
    await page.click('[data-filter="editorial"]');
    assert.ok(await page.$$eval('[data-material]:not([hidden])',els=>els.length>0&&els.every(e=>e.dataset.genre==='editorial')));
    await page.type('[data-search]','zzzzzzzz');
    assert.equal(await page.$$eval('[data-material]:not([hidden])',els=>els.length),0);
    assert.equal(await page.$eval('[data-empty]',el=>el.hidden),false);
    await page.click('[data-reset]');
    await page.type('[data-search]','Cobalt');
    assert.ok(await page.$$eval('[data-material]:not([hidden])',els=>els.some(e=>e.dataset.name==='Cobalt')&&els.every(e=>e.dataset.search.includes('cobalt'))));
    await page.$eval('[data-search]',el=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.click('[data-show-all]');
    assert.equal(await page.$$eval('[data-material]:not([hidden])',els=>els.length),50);
  });
  await check('modal opens a real relative demo, closes with Escape, restores focus',async()=>{
    await page.click('[data-material="studio"] [data-preview]');
    await page.waitForSelector('dialog[open]');
    assert.match(await page.$eval('[data-dialog-iframe]',el=>el.src),/\/slopless\/site\/themes\/studio\/$/);
    assert.equal(await page.$eval('#dialog-title',el=>el.textContent),'Studio');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('dialog',el=>el.open),false);
    assert.ok(await page.$eval('[data-material="studio"] [data-preview]',el=>el===document.activeElement));
  });
  await page.goto(base+prefix,{waitUntil:'networkidle0'});
  await page.addScriptTag({path:axe});
  await check('homepage has no serious or critical axe accessibility violations',async()=>{
    const result=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
    const blocking=result.filter(v=>['serious','critical'].includes(v.impact));
    assert.deepEqual(blocking.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  });
  await check('mobile through widescreen: no horizontal overflow or broken visible local images',async()=>{
    for(const width of [320,360,390,480,768,834,1024,1280,1440]) {
      await page.setViewport({width,height:900});
      await page.evaluate(()=>window.scrollTo(0,0));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
      const broken=await page.$$eval('img',els=>els.filter(e=>e.getBoundingClientRect().height&&e.complete&&!e.naturalWidth).map(e=>e.src));
      assert.deepEqual(broken,[],`broken images at ${width}`);
    }
  });
  mkdirSync(join(root,'.test-results'),{recursive:true});
  await page.setViewport({width:1440,height:1000});await page.goto(base+prefix,{waitUntil:'networkidle0'});
  await page.screenshot({path:join(root,'.test-results','desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844});
  await page.screenshot({path:join(root,'.test-results','mobile.png'),fullPage:true});
  await check('clipboard button copies the published installation command',async()=>{
    // An explicit test stub verifies the exact payload without relying on headless clipboard permissions.
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.copiedCommand=text;}}});});
    await page.click('#install [data-copy]');
    assert.equal(await page.evaluate(()=>window.copiedCommand),"npx skills add arbabtalha/slopless -g");
    assert.equal(await page.$eval('#install [data-copy]',e=>e.textContent),'Copied');
  });
  await check('docs, credits, all fifty theme pages and all twenty-one examples load under a project subpath',async()=>{
    const paths=['docs/','credits/',...JSON.parse(readFileSync(join(root,'skills/slopless/references/themes/index.json'))).themes.map(t=>`themes/${t.slug}/`)];
    const {readdirSync}=await import('node:fs');
    paths.push(...readdirSync(join(root,'site/made')).map(s=>`made/${s}/`));
    for(const path of paths) {
      const res=await page.goto(base+prefix+path,{waitUntil:'domcontentloaded'});
      assert.equal(res.status(),200,path);
      assert.match(await page.title(),/Slopless/,path);
      if(path.startsWith('themes/')||path.startsWith('made/')) {
        assert.ok(await page.$('[data-slopless-demo]'),path);
        assert.match(await page.$eval('.slopless-demo-brand',el=>el.href),/\/slopless\/site\/$/);
      } else {
        await page.addScriptTag({path:axe});
        const violations=await page.evaluate(async()=> (await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
        assert.deepEqual(violations,[],path);
      }
    }
  });
  await check('core homepage works without JavaScript and with reduced motion',async()=>{
    await page.setJavaScriptEnabled(false);await page.goto(base+prefix,{waitUntil:'domcontentloaded'});
    assert.equal(await page.$$eval('[data-material]:not([hidden])',els=>els.length),50);
    assert.ok(await page.$('a[href="docs/"]'));
    await page.setJavaScriptEnabled(true);await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(base+prefix,{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  });
  assert.deepEqual(errors,[],'Uncaught JavaScript errors');
  console.log(`Browser QA: ${results.length} scenarios passed. Screenshots: .test-results/desktop.png and mobile.png`);
} finally {
  await browser?.close();
  await new Promise(r=>server.close(r));
}
