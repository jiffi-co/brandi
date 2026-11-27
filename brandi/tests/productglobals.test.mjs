import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { toStarterGlobals, toShadcnTheme, railMarks, SHADCN } from '../scripts/productglobals.mjs';
import { buildProductTokens } from '../scripts/producttokens.mjs';
import { buildSystem } from '../scripts/system.mjs';
import { systemInputFromBrand } from '../scripts/brandfile.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const brand = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'fixtures', 'muddy-paws.json'), 'utf8'));
const tokens = buildProductTokens(buildSystem(systemInputFromBrand(brand)), { name: 'Muddy Paws product system' });
const css = toStarterGlobals(tokens);
const section = (from, to) => css.slice(css.indexOf(from), to ? css.indexOf(to, css.indexOf(from)) : undefined);

describe('toStarterGlobals', () => {
  test('declares every colour token in light, with aliases as var() references', () => {
    const light = section(':root,\n[data-theme="light"] {', '.dark,');
    for (const t of tokens.color.tokens) assert.ok(light.includes(`  --${t.name}: `), `light is missing ${t.name}`);
    assert.match(light, /--rail: var\(--surface\);/);
    assert.equal(/undefined|NaN|\{[a-z-]+\}/.test(css), false);
  });

  test('re-declares aliases in dark, so they resolve inside the dark scope rather than picking up light', () => {
    const dark = section('.dark,\n[data-theme="dark"] {', ':root {');
    assert.match(dark, /--rail: var\(--surface\);/);
    assert.match(dark, /--chart-track: var\(--surface-sunken\);/);
  });

  test("each theme says which of the logo's renditions the rail shows, from the rail's own tone in that theme", () => {
    // A quiet rail is the surface: light in light, dark in dark.
    assert.match(section(':root,\n[data-theme="light"] {', '.dark,'), /--rail-mark-on-light: flex;\n {2}--rail-mark-on-dark: none;/);
    assert.match(section('.dark,\n[data-theme="dark"] {', ':root {'), /--rail-mark-on-light: none;\n {2}--rail-mark-on-dark: flex;/);
    // A navy rail is dark in both themes, so both take the rendition drawn for dark grounds.
    const navy = toStarterGlobals(buildProductTokens(buildSystem(systemInputFromBrand(brand)), { roles: { rail: { light: '#102B4B', dark: '#102B4B' } } }));
    assert.equal((navy.match(/--rail-mark-on-dark: flex;/g) ?? []).length, 2);
    assert.equal((navy.match(/--rail-mark-on-light: none;/g) ?? []).length, 2);
    assert.deepEqual(railMarks({ color: { tokens: [] } }, 'dark'), [['rail-mark-on-light', 'flex'], ['rail-mark-on-dark', 'none']], 'no rail at all: the light-ground rendition');
  });

  test("the brand's texture move is a class in the components layer, its file in the starter's textures/", () => {
    assert.doesNotMatch(css, /brand-texture/, 'no texture move, no class');
    const move = { name: 'The paper ground', source: 'p13', where: ['the sign-in hero'], file: 'textures/paper.jpg', kind: 'texture', strength: 0.35 };
    const textured = toStarterGlobals(buildProductTokens(buildSystem(systemInputFromBrand(brand)), { shape: { moves: [move] } }));
    const layer = textured.slice(textured.indexOf('@layer components {'));
    // Relative to app/globals.css, and to bundle.css in ds/<namespace>/components/: both reach the one textures/ folder.
    assert.match(layer, /\.brand-texture::before \{[^}]*url\("\.\.\/textures\/paper\.jpg"\)[^}]*mix-blend-mode: multiply;[^}]*opacity: 0\.35;/s);
    assert.match(layer, /\.brand-texture \{[^}]*isolation: isolate;/s);
  });

  test('points every shadcn variable at a product role', () => {
    for (const [name, role] of SHADCN) assert.ok(css.includes(`  --${name}: var(--${role});`), `${name} is not mapped to ${role}`);
  });

  test('removes Tailwind\'s palette and never turns brand-* values into utilities', () => {
    const theme = section('@theme inline {', '/* 5.');
    assert.match(theme, /--color-\*: initial;/);
    assert.equal(/--color-brand-(?!hover:)/.test(theme), false, 'no brand value becomes a utility');
    assert.match(theme, /--color-brand-hover: var\(--brand-hover\);/, 'brand-hover is a role, so hover:bg-brand-hover works');
    assert.match(theme, /--color-text-muted: var\(--text-muted\);/);
  });

  test('writes a type utility per style, with tabular figures on figures and uppercase only on eyebrows', () => {
    for (const g of tokens.type.groups) for (const s of g.styles) assert.ok(css.includes(`@utility type-${s.name} {`), `no utility for ${s.name}`);
    assert.match(section('@utility type-kpi {', '}'), /tabular-nums/);
    assert.match(section('@utility type-eyebrow {', '}'), /text-transform: uppercase/);
    assert.equal(/text-transform/.test(section('@utility type-body {', '}')), false);
  });

  test('draws focus as an outline with an offset, and as CanvasText in forced colours', () => {
    assert.match(section('@layer base {'), /:focus-visible \{\n {4}outline: var\(--focus-width\) solid var\(--focus\);\n {4}outline-offset: var\(--focus-offset\);/);
    assert.match(section('@media (forced-colors: active) {'), /outline: 2px solid CanvasText;/);
  });

  test('uses next/font\'s variable for the brand\'s faces, and the plain stack where the brand has none', () => {
    assert.match(css, /--font-sans: var\(--font-brand-sans, Karla\), ui-sans-serif/, 'the face is the variable\'s fallback, so a board without next/font still gets it');
    const noMono = buildProductTokens(buildSystem({ primary: '#1F6F4A', type: { display: 'Bitter', body: 'Karla' } }));
    const out = toStarterGlobals(noMono);
    assert.match(out, /--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;/);
  });

  test('refuses tokens that lack a role shadcn needs, rather than writing a dangling variable', () => {
    const broken = structuredClone(tokens);
    broken.color.tokens = broken.color.tokens.filter((t) => t.name !== 'line-control');
    assert.throws(() => toStarterGlobals(broken), /line-control/);
  });

  test('is deterministic', () => {
    assert.equal(toStarterGlobals(tokens), css);
  });
});

describe('the file runs on its own, as a product\'s tools/build-globals.mjs', () => {
  test('writes globals.css from a tokens file, and --check catches a hand edit', async () => {
    const { mkdtemp, writeFile, readFile, copyFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const dir = await mkdtemp(path.join(tmpdir(), 'brandi-globals-'));
    try {
      // Copied out of the plugin, the way a product carries it.
      const tool = path.join(dir, 'build-globals.mjs');
      await copyFile(path.join(ROOT, 'scripts', 'productglobals.mjs'), tool);
      await writeFile(path.join(dir, 'tokens.json'), JSON.stringify(tokens));
      await run(process.execPath, [tool, path.join(dir, 'tokens.json'), path.join(dir, 'globals.css')]);
      assert.equal(await readFile(path.join(dir, 'globals.css'), 'utf8'), css);
      await run(process.execPath, [tool, path.join(dir, 'tokens.json'), path.join(dir, 'globals.css'), '--check']);
      await writeFile(path.join(dir, 'globals.css'), css.replace('--space-4: 16px;', '--space-4: 15px;'));
      await assert.rejects(
        run(process.execPath, [tool, path.join(dir, 'tokens.json'), path.join(dir, 'globals.css'), '--check']),
        (e) => e.code === 1 && /drifted/.test(e.stderr),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('toShadcnTheme', () => {
  const theme = toShadcnTheme(tokens);
  const role = (name, mode) => {
    const v = tokens.color.tokens.find((t) => t.name === name).value;
    const raw = typeof v === 'object' ? (v[mode] ?? v.light) : v;
    return /^\{(.+)\}$/.test(raw) ? role(raw.slice(1, -1), mode) : raw;
  };

  test('is a registry:theme item named from the system, with every shadcn variable in both modes', () => {
    assert.equal(theme.type, 'registry:theme');
    assert.equal(theme.name, 'muddy-paws-product-system');
    for (const mode of ['light', 'dark']) {
      for (const [name] of [['primary'], ...SHADCN]) assert.ok(theme.cssVars[mode][name], `${mode} ${name}`);
    }
    assert.equal(theme.cssVars.light.radius, tokens.radius.tokens.find((t) => t.name === 'radius-md').value);
    assert.match(theme.cssVars.theme['font-sans'], /,/, 'the sans stack, fallbacks and all');
  });

  test('every value is resolved to the role it maps, alias chains followed in each mode, never a variable or an alias', () => {
    for (const mode of ['light', 'dark']) {
      for (const [name, r] of [['primary', 'primary'], ...SHADCN]) {
        const got = theme.cssVars[mode][name];
        assert.doesNotMatch(got, /^\{|var\(/, `${mode} ${name} is ${got}`);
        assert.equal(got, role(r, mode), `${mode} ${name} is ${r}`);
      }
    }
  });

  test('a missing role, an alias to nothing and an alias loop are refused by name', () => {
    const without = structuredClone(tokens);
    without.color.tokens = without.color.tokens.filter((t) => t.name !== 'rail');
    assert.throws(() => toShadcnTheme(without), /do not have: rail$/);
    const dangling = structuredClone(tokens);
    dangling.color.tokens.find((t) => t.name === 'rail').value = { light: '{nowhere}', dark: '{nowhere}' };
    assert.throws(() => toShadcnTheme(dangling), /rail aliases nowhere/);
    const loop = structuredClone(tokens);
    loop.color.tokens.find((t) => t.name === 'rail').value = { light: '{rail}', dark: '{rail}' };
    assert.throws(() => toShadcnTheme(loop), /rail aliases itself: rail -> rail/);
  });

  // shadcn's own schema lives in the kit's node_modules, which brandi does not carry.
  const modules = process.env.BRANDI_KIT_MODULES && path.resolve(process.env.BRANDI_KIT_MODULES);
  const schema = modules && path.join(modules, 'shadcn', 'dist', 'schema', 'index.js');
  test("shadcn's own registry item schema accepts it", { skip: schema && existsSync(schema) ? false : "needs the kit's node_modules: set BRANDI_KIT_MODULES" }, async () => {
    const { registryItemSchema } = await import(schema);
    const parsed = registryItemSchema.safeParse(theme);
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3)));
  });
});
