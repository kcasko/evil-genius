import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import engine from '../game/engine.js';

test('fallback mission runs deterministic resolution and dossier exposes its chip',async()=>{
  const mission=engine.MISSIONS[0];
  const result=engine.resolveMissionWithDecision(engine.createFreshGame(),mission,0,{fallback:true,reason:'disabled'},{luck:0});
  assert.equal(result.deterministic,true);
  assert.equal(result.decision.provider,'deterministic demo');
  assert.equal(result.assigned.id,mission.plans[0].by);
  assert.equal(result.state.day,2);
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/outcome\.deterministic\?'<span class="deterministic-chip">\[DETERMINISTIC\]<\/span>'/);
});

test('frontend keeps intentional cancellation deterministic and accessible',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/signal\?\.aborted\|\|EvilGeniusAiStatus\.getAiStatus\(\)\.mode!==['"]live['"]/);
  assert.match(html,/\['disabled','cancelled','offline'\]\.includes\(result\.reason\)/);
  assert.match(html,/panel\.contains\(document\.activeElement\)/);
  assert.match(html,/targetMs=cold\?90000:10000/);
  assert.match(html,/aria-valuetext="Council request started"/);
  assert.match(html,/narrate\(current,p,result\.assigned,result\.win,story,activeRequest\.signal\)/);
});
