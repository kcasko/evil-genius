import test from 'node:test';
import assert from 'node:assert/strict';
import ux from '../game/coldStartUx.js';

test('90 second cold-start progress is linear and clamps at 100 percent',()=>{
  const start=5000;
  assert.equal(ux.coldStartProgress(start,start+10000),100/9);
  assert.equal(ux.coldStartProgress(start,start+45000),50);
  assert.equal(ux.coldStartProgress(start,start+90000),100);
  assert.equal(ux.coldStartProgress(start,start+180000),100);
});
