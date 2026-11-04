#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const skill='skills/slopless';
const run=(args)=>{
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
};
run([`${skill}/scripts/refcheck.mjs`]);
const themeDir=`${skill}/references/themes`;
const themes=readdirSync(join(root,themeDir)).filter(n=>n.endsWith('.md')&&n!=='README.md').map(n=>`${themeDir}/${n}`);
run([`${skill}/scripts/theme.mjs`,'validate',...themes]);
const index=join(root,themeDir,'index.json');
const before=readFileSync(index,'utf8');
run([`${skill}/scripts/theme.mjs`,'index']);
if(readFileSync(index,'utf8')!==before){console.error('Theme index was stale. Review and commit the generated update.');process.exit(1);}
run(['scripts/build-site.mjs','--check']);
run(['scripts/check-site.mjs']);
const tests=['tests',`${skill}/scripts`,`${skill}/scripts/fixtures/imagegen`].flatMap(dir=>readdirSync(join(root,dir)).filter(f=>f.endsWith('.test.mjs')).map(f=>`${dir}/${f}`));
run(['--test',...tests]);
console.log('All verification checks passed. Browser regression tests require configured Chrome/Puppeteer; run npm run test:browser for website interaction and accessibility checks.');
