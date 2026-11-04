import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { migrate } from '../scripts/migrate.mjs';
// Resolve from the test file without depending on the process working directory.
const repo = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, repo), 'utf8');
const script = p => new URL(p, repo).pathname;
const run = (name, args = [], options = {}) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8', ...options });
const temp = fn => {
  const dir = mkdtempSync(join(tmpdir(), 'slopless-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('package, plugin, marketplace and skill agree on identity and version', () => {
  const pkg = JSON.parse(read('package.json'));
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const market = JSON.parse(read('.claude-plugin/marketplace.json'));
  const skill = read('skills/slopless/SKILL.md');
  for (const obj of [pkg, plugin, market, market.plugins[0]]) assert.equal(obj.name, 'slopless');
  for (const obj of [plugin, market.plugins[0]]) assert.equal(obj.version, pkg.version);
  assert.match(skill, /^name: slopless$/m);
  assert.match(skill, new RegExp(`^version: ${pkg.version.replaceAll('.', '\\.')}$`, 'm'));
  assert.ok(existsSync(new URL(pkg.skill.entry, repo)));
  assert.equal(market.plugins[0].skills[0], './slopless');
  assert.equal(plugin.repository, 'https://github.com/arbabtalha/slopless');
  assert.match(read('skills/slopless/agents/openai.yaml'), /\$slopless/);
});

test('copyright notices and source acknowledgement ship with the skill', () => {
  for (const p of ['LICENSE', 'skills/slopless/LICENSE']) {
    assert.match(read(p), /Copyright \(c\) 2026 Hallmark contributors/);
    assert.match(read(p), /The above copyright notice and this permission notice/);
  }
  assert.match(read('skills/slopless/NOTICE.md'), /github.com\/Nutlope\/hallmark/);
  assert.match(read('skills/slopless/scripts/install.mjs'), /"NOTICE.md"/);
});

test('installer dry run checks references without touching the user home', () => temp(home => {
  mkdirSync(join(home, '.claude'));
  const result = run('skills/slopless/scripts/install.mjs', ['--claude', '--dry-run'], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /skills\/slopless/);
  assert.deepEqual(readdirSync(join(home, '.claude')), []);
}));

test('isolated install, reinstall and removal preserve unrelated skills', () => temp(home => {
  const skills = join(home, '.claude', 'skills');
  mkdirSync(join(skills, 'unrelated'), { recursive: true });
  writeFileSync(join(skills, 'unrelated', 'keep.txt'), 'keep');
  const options = { env: { ...process.env, HOME: home, USERPROFILE: home } };
  for (let i = 0; i < 2; i++) {
    const result = run('skills/slopless/scripts/install.mjs', ['--claude'], options);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  for (const file of ['SKILL.md','LICENSE','NOTICE.md','scripts/theme.mjs','references/themes/index.json']) assert.ok(existsSync(join(skills, 'slopless', file)), file);
  assert.ok(!existsSync(join(skills,'slopless','scripts','fixtures')));
  const result = run('skills/slopless/scripts/install.mjs', ['--remove'], options);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!existsSync(join(skills, 'slopless')));
  assert.equal(readFileSync(join(skills, 'unrelated', 'keep.txt'), 'utf8'), 'keep');
}));

test('hooks install idempotently, preserve foreign hooks, remove only ours', () => temp(project => {
  mkdirSync(join(project, '.claude'));
  const file = join(project, '.claude', 'settings.json');
  const foreign = { matcher: 'Edit', hooks: [{ type: 'command', command: 'echo keep' }] };
  writeFileSync(file, JSON.stringify({ permissions: { allow: [] }, hooks: { PostToolUse: [foreign] } }));
  for (let i = 0; i < 2; i++) assert.equal(run('skills/slopless/scripts/install-hook.mjs', [], { cwd: project }).status, 0);
  let settings = JSON.parse(readFileSync(file));
  assert.equal(settings.hooks.PostToolUse.length, 2);
  assert.deepEqual(settings.hooks.PostToolUse[0], foreign);
  assert.match(settings.hooks.PostToolUse[1].hooks[0].command, /slopless\/scripts\/lint-hook.mjs/);
  assert.equal(run('skills/slopless/scripts/install-hook.mjs', ['--remove'], { cwd: project }).status, 0);
  settings = JSON.parse(readFileSync(file));
  assert.deepEqual(settings.hooks.PostToolUse, [foreign]);
  assert.deepEqual(settings.permissions, { allow: [] });
}));

test('unparseable hook settings are never overwritten', () => temp(project => {
  mkdirSync(join(project, '.claude'));
  const file = join(project,'.claude','settings.json');writeFileSync(file, '{ broken');
  assert.equal(run('skills/slopless/scripts/install-hook.mjs', [], { cwd: project }).status, 1);
  assert.equal(readFileSync(file,'utf8'), '{ broken');
}));

test('migration supports dry-run, is idempotent, never overwrites or deletes', () => temp(project => {
  const legacy = join(project,'.hallmark');
  mkdirSync(join(legacy,'img-cache'), { recursive: true });
  writeFileSync(join(legacy,'log.json'), '[1]');writeFileSync(join(legacy,'img-cache','photo.png'), 'source');
  assert.equal(migrate(project, { dryRun: true }).copied.length, 2);
  assert.ok(!existsSync(join(project,'.slopless')));
  mkdirSync(join(project,'.slopless'));writeFileSync(join(project,'.slopless','log.json'), '[2]');
  const result = migrate(project);
  assert.deepEqual(result.copied, ['img-cache/photo.png']);assert.deepEqual(result.skipped, ['log.json']);
  assert.equal(readFileSync(join(project,'.slopless','log.json'),'utf8'), '[2]');
  assert.equal(readFileSync(join(legacy,'log.json'),'utf8'), '[1]');
  assert.equal(migrate(project).copied.length, 0);
}));

test('migration preflights all files and refuses source or destination symlinks', () => temp(project => {
  const legacy = join(project,'.hallmark');mkdirSync(legacy);
  writeFileSync(join(legacy,'a.json'), '{}');symlinkSync(join(project,'absent'), join(legacy,'z-link'));
  assert.throws(() => migrate(project), /symlink/);
  assert.ok(!existsSync(join(project,'.slopless')));
  rmSync(join(legacy,'z-link'));symlinkSync(legacy,join(project,'.slopless'));
  assert.throws(() => migrate(project), /symlink/);
}));

test('legacy CSS stamps still produce the same lint result', () => temp(project => {
  const fixture = read('skills/slopless/scripts/fixtures/waiver/index.html');
  const file = join(project,'index.html');
  writeFileSync(file,fixture);
  const current = run('skills/slopless/scripts/sloplint.mjs',[file,'--json']);
  writeFileSync(file,fixture.replaceAll('Slopless','Hallmark'));
  const legacy = run('skills/slopless/scripts/sloplint.mjs',[file,'--json']);
  assert.deepEqual(JSON.parse(legacy.stdout).summary,JSON.parse(current.stdout).summary);
}));
