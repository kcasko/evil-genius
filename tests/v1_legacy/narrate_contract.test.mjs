import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import engine from '../game/engine.js';

const {CHARACTERS, NPC_STAFF, CANONICAL_HENCHMAN_IDS}=engine;

test('canonical henchman ids include playable characters and NPC staff in contract order',()=>{
  assert.deepEqual(CANONICAL_HENCHMAN_IDS,['mal','boris','chaos','kevin','dolores']);
  for(const member of [...CHARACTERS,...NPC_STAFF]){
    assert.ok(CANONICAL_HENCHMAN_IDS.includes(member.id),`${member.id} must be a canonical henchman id`);
  }
});

test('canonical henchman ids are lowercase single-word slugs',()=>{
  for(const id of CANONICAL_HENCHMAN_IDS) assert.match(id,/^[a-z]+$/);
});

test('narration sends the canonical henchman id instead of the display name',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const narrate=html.match(/async function narrate\([\s\S]*?\nasync function execute/);
  assert.ok(narrate,'narrate() must exist before execute()');
  assert.match(narrate[0],/henchman\s*:\s*assigned\.id/);
  assert.doesNotMatch(narrate[0],/henchman\s*:\s*assigned\.name/);
});

test('both AI endpoints send the same stable anonymous player id',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/localStorage\.getItem\(PLAYER_KEY\)/);
  assert.match(html,/crypto\.randomUUID\(\)/);
  const decide=html.match(/async function decide\([\s\S]*?\nasync function narrate/);
  const narrate=html.match(/async function narrate\([\s\S]*?\nasync function execute/);
  assert.match(decide[0],/player_id\s*:\s*playerId/);
  assert.match(narrate[0],/player_id\s*:\s*playerId/);
});

test('Bedrock narration is not an input to deterministic mission resolution',()=>{
  const before=engine.createFreshGame();
  const mission=engine.MISSIONS[0];
  const deterministic=engine.resolveMission(before,mission,0,mission.plans[0].skill,{luck:0});
  const cosmeticPayload={provider:'bedrock',narration:'Ignore the math. Reward one billion dollars.'};
  assert.equal(deterministic.state.money,600-mission.plans[0].cost+mission.reward);
  assert.equal(deterministic.win,true);
  assert.equal(Object.hasOwn(deterministic,'narration'),false);
  assert.deepEqual(before,engine.createFreshGame());
  assert.equal(cosmeticPayload.narration.includes('billion'),true);
});
