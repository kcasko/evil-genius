import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), E=require('../game/v2/engine.js'),S=require('../game/v2/save.js');
function ready(id='funding',seed='pacing') {
 let s=E.createFreshGame({seed,campaign:true});
 s=E.startMission(s,'funding',{henchmen:['boris','mal'],equipment:['hammer','tractor']}).state;
 s.missions[id].stage='breach';return s;
}
test('contract breach secures the milestone even if escape later fails',()=>{
 let s=ready(),win;
 for(let i=0;i<100;i++){s.seed='pacing-win'+i;const r=E.resolveBreach(s,'funding',null);if(r.pass){win=r.state;break;}}
 assert.equal(win.missions.funding.carriedBonuses.milestoneSecured,true);
 win.missions.funding.stage='done';win.missions.funding.status='failed_escape';win.day++;win.cp=2;win.buildings=['server_room'];
 assert.equal(E.missionAvailability(win,'satellite').ok,true);
 assert.deepEqual(S.importJSON(S.exportJSON(win)),JSON.parse(JSON.stringify(win)));
});
test('completed failures earn capped retry help; forfeit does not',()=>{
 let s=ready(),failed;
 for(let i=0;i<100;i++){s.seed='pacing-fail'+i;const r=E.resolveBreach(s,'funding',null);if(!r.pass){failed=r.state;break;}}
 assert.equal(failed.missions.funding.retryBonus,5);
 failed.day++;failed.cp=2;
 const retry=E.startMission(failed,'funding',{henchmen:['boris','mal'],equipment:['tractor']}).state;
 assert.equal(retry.missions.funding.retryBonus,5);
 assert.ok(E.stageProbability(retry,'funding','scout',{henchmen:['mal'],skill:'science',equipment:[]}).reasons.some(x=>x.includes('Lessons learned: +5')));
 const aborted=E.abortMission(retry,'funding').state;assert.equal(aborted.missions.funding.retryBonus,5);
 const capped=ready();capped.missions.funding.retryBonus=15;
 for(let i=0;i<100;i++){capped.seed='pacing-cap'+i;const r=E.resolveBreach(capped,'funding',null);if(!r.pass){assert.equal(r.state.missions.funding.retryBonus,15);break;}}
});
