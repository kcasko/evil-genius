const E=require('../game/v2/engine.js'),C=require('../game/v2/content.js'),S=require('../game/v2/save.js');
const fs=require('fs');
const pairs=ids=>ids.flatMap((a,i)=>ids.slice(i+1).map(b=>[a,b]));
function play(seed){
 let s=E.createFreshGame({seed,campaign:true}),actions=[],stages=0,launches=0;
 const action=a=>{const r=E.spendCommandPoint(s,a);if(!r.error){s=r.state;actions.push({day:s.day,action:a.kind,detail:a.building||a.equipment||a.henchman});return true;}return false;};
 for(let day=0;day<35 && s.outcome==='running';day++){
  for(const c of [...s.crises]){
   const def=C.CRISES_BY_ID[c.id];let best=null;
   for(const opt of def.options){const r=E.spendCommandPoint(s,{kind:'dismiss_crisis',crisisId:c.id,choiceId:opt.id});if(r.error)continue;
    const t=r.state;const score=(t.money-s.money)/30+(t.cp-s.cp)*3+(s.heat-t.heat)*2+(t.morale-s.morale)/5+(t.infamy-s.infamy)/5-(t.equipmentBroken.length-s.equipmentBroken.length)*5;
    if(!best||score>best.score)best={opt,score};}
   if(best)action({kind:'dismiss_crisis',crisisId:c.id,choiceId:best.opt.id});
  }
  if(s.heat>35)action({kind:'laylow'});
  for(const building of ['server_room','lab','rec_room']){
   if(!s.buildings.includes(building)&&!s.buildQueue.some(q=>q.id===building)){action({kind:'build',building});break;}
  }
  if(!s.equipmentUnlocked.includes('aid'))action({kind:'research',equipment:'aid'});
  const stressed=C.HENCH_IDS.slice().sort((a,b)=>(s.henchmen[b].stress+(s.henchmen[b].rage||0))-(s.henchmen[a].stress+(s.henchmen[a].rage||0)));
  if((s.henchmen[stressed[0]].stress||s.henchmen[stressed[0]].rage)>40)action({kind:'dayoff',henchman:stressed[0]});
  const id=['funding','satellite','prototype','moon'].find(id=>s.missions[id].status!=='success' && !s.missions[id].carriedBonuses.milestoneSecured && !(id==='prototype' && s.missions[id].carriedBonuses.prototypeTested));
  if(id && E.missionAvailability(s,id).ok){
   const def=C.MISSIONS_BY_ID[id];
   const crew=C.HENCH_IDS.slice().sort((a,b)=>{
    const score=h=>s.henchmen[h].competence*2-(s.henchmen[h].stress||0)/5+(def.favoredSkills?.includes(C.HENCHMEN_BY_ID[h].skill)?10:0);
    return score(b)-score(a);
   }).slice(0,id==='moon'?4:3);
   const gear=s.equipment.filter(e=>!s.equipmentBroken.includes(e));
   const kit=gear.includes('aid')?['aid']:[];
   const weapon=gear.filter(e=>C.EQUIPMENT_BY_ID[e].synergy&&crew.some(h=>C.HENCHMEN_BY_ID[h].skill===C.EQUIPMENT_BY_ID[e].synergy)).sort((a,b)=>(a==='tractor')-(b==='tractor'))[0];
   if(weapon)kit.push(weapon);
   const r=E.startMission(s,id,{henchmen:crew,equipment:kit});
   if(r.error)throw Error(r.error);s=r.state;launches++;actions.push({day:s.day,action:'launch',detail:id});
   while(s.missions[id].stage!=='done'){
    const m=s.missions[id],stage=m.stage;let r;
    if(stage==='scout'){
     const options=crew.flatMap(h=>[null,...kit].map(eq=>({henchman:h,equipment:eq,p:E.stageProbability(s,id,'scout',{henchmen:[h],equipment:eq?[eq]:[],skill:C.HENCHMEN_BY_ID[h].skill}).probability}))).sort((a,b)=>b.p-a.p);
     r=E.resolveScout(s,id,options[0]);
    }else if(stage==='approach'){
     const options=C.ROUTES.flatMap(route=>pairs(crew).map(h=>({route:route.id,henchmen:h,p:E.stageProbability(s,id,'approach',{routeId:route.id,henchmen:h,skill:route.skill}).probability}))).sort((a,b)=>b.p-a.p);
     r=E.resolveApproach(s,id,options[0]);
    }else if(stage==='breach')r=E.resolveBreach(s,id,null);
    else if(stage==='escape'){
     const available=E.escapePlanAvailability(s,id);const plans=['fast','clever','loud'].filter(p=>available[p].ok).sort((a,b)=>E.stageProbability(s,id,'escape',{plan:b}).probability-E.stageProbability(s,id,'escape',{plan:a}).probability);
     r=E.resolveEscape(s,id,plans[0]);
    }
    if(r.error)throw Error(r.error);s=r.state;stages++;actions.push({day:s.day,action:stage,detail:id,pass:r.pass,heat:s.heat});
   }
   if(JSON.stringify(S.importJSON(S.exportJSON(s)))!==JSON.stringify(s))throw Error('Save mismatch');
  }
  if(s.cp>0 && s.heat>25)action({kind:'laylow'});
  if(s.cp>0 && (s.henchmen[stressed[0]].stress||s.henchmen[stressed[0]].rage)>20)action({kind:'dayoff',henchman:stressed[0]});
  if(s.outcome==='running')action({kind:'end_day'});
 }
 return {seed,outcome:s.outcome,days:s.day,money:s.money,heat:s.heat,stages,launches,actions,state:s};
}
const runs=Array.from({length:30},(_,i)=>play('campaign-'+i));
fs.writeFileSync('campaign-balance-playtests.json',JSON.stringify(runs,null,2));
console.log(JSON.stringify(runs.map(({state,actions,...summary})=>summary),null,2));
