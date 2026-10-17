// Regression: index.html inline script must be block-scoped so its top-level
// `const`s don't collide with game/engine.js's top-level `const`s (all classic
// <script> tags share one global lexical scope). The collision bug blocked
// EVERY page load with 'SyntaxError: Identifier AVAILABLE_TOOLS has already
// been declared' until the inline body was wrapped in { ... }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('engine.js declares shared top-level consts', () => {
  const engine = readFileSync('game/engine.js', 'utf8');
  for (const name of ['AVAILABLE_TOOLS', 'CHARACTERS', 'MISSIONS', 'NPC_STAFF']) {
    const re = new RegExp(`const\\s+${name}\\b`);
    assert.ok(re.test(engine), `engine.js must declare const ${name}`);
  }
});

test('index.html inline script after coldStartUx.js is block-scoped', () => {
  const html = readFileSync('index.html', 'utf8');
  const m = html.match(/<script src="game\/coldStartUx\.js"><\/script><script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'inline <script> after coldStartUx.js must exist');
  const body = m[1].trim();
  assert.ok(body.startsWith('{'), 'inline script body must open with { (block-scope guard against engine.js collisions)');
  assert.ok(body.endsWith('}'), 'inline script body must close with }');
});

test('index.html inline script does not re-declare bare AVAILABLE_TOOLS', () => {
  const html = readFileSync('index.html', 'utf8');
  const m = html.match(/<script src="game\/coldStartUx\.js"><\/script><script>([\s\S]*?)<\/script>/);
  const body = m[1];
  // destructure-rename `AVAILABLE_TOOLS:ENGINE_AVAILABLE_TOOLS` is fine; bare `const AVAILABLE_TOOLS` is not.
  assert.ok(!/\bconst\s+AVAILABLE_TOOLS\s*=/.test(body) && !/\blet\s+AVAILABLE_TOOLS\s*=/.test(body),
    'inline script must not re-declare AVAILABLE_TOOLS at top level');
});
