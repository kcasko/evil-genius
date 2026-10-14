const CHARACTERS = [
  {id:'mal',name:'Dr. Malpractice',icon:'🧪',job:'Unlicensed Science Officer',skill:'science',bio:'Has nine PhDs. Eight are suspicious.',loyalty:66},
  {id:'boris',name:'Boris the Brute',icon:'💪',job:'Director of Physical Solutions',skill:'force',bio:'Believes every problem can be punched.',loyalty:83},
  {id:'chaos',name:'CHAOS-9000',icon:'🤖',job:'Chief of Manipulation',skill:'deception',bio:'Can hack minds. Cannot use a printer.',loyalty:52},
  {id:'kevin',name:'Kevin from Accounting',icon:'📊',job:'Financial Warlock',skill:'finance',bio:'Expense reports are his weapon.',loyalty:94},
];

const MISSIONS = [
  {id:'moon',icon:'🌕',name:'Steal the Moon',desc:'A modest first step. One small theft for a villain, one enormous insurance claim for mankind.',reward:380,heat:18,plans:[{name:'Build a Tractor Beam',by:'mal',skill:'science',cost:210,desc:'Relocate the moon with questionable physics.',win:'The moon shifts six inches. NASA declares an emergency. You declare victory.',lose:'The beam steals a neighboring billboard instead. It says YOU ARE HERE.'},{name:'Install a Very Tall Ladder',by:'boris',skill:'force',cost:55,desc:'Send Boris to climb the entire atmosphere.',win:'Boris reaches a weather balloon and plants your flag. Close enough for the tabloids.',lose:'Boris falls off the ladder at step seven. The ladder is still taller than the budget.'},{name:'Purchase Moon Ownership',by:'kevin',skill:'finance',cost:95,desc:'Acquire rights through aggressively creative accounting.',win:'Kevin buys an obscure lunar naming right. He invoices the United Nations.',lose:'Kevin buys 40 pounds of moon-themed cheese. Accounts Payable is furious.'}]},
  {id:'mondays',icon:'📅',name:'Outlaw Mondays',desc:'Eliminate the most universally disliked day. Revolutionary evil, surprisingly good polling.',reward:280,heat:12,plans:[{name:'Rewrite Every Calendar',by:'chaos',skill:'deception',cost:145,desc:'Confuse every calendar app in existence.',win:'Mondays disappear from 300 calendars. Workers celebrate. Economists panic.',lose:'Every day is now Monday. You have become the villain you swore to destroy.'},{name:'Threaten the Clock Tower',by:'boris',skill:'force',cost:75,desc:'Intimidate time itself.',win:'The mayor declares a symbolic No Monday holiday to make Boris leave.',lose:'Boris punches a clock. Time is unaffected. The clock files a complaint.'},{name:'Lobby for Four-Day Weekends',by:'kevin',skill:'finance',cost:90,desc:'Use paperwork as a tool of domination.',win:'Your labor proposal passes. Unexpectedly, you are now a folk hero.',lose:'Kevin accidentally schedules more Monday meetings. Morale hits a new low.'}]},
  {id:'coffee',icon:'☕',name:'Control All Coffee',desc:'Own the bean. Control the world. Ignore the fact that this is just retail.',reward:320,heat:15,plans:[{name:'Synthesize Evil Espresso',by:'mal',skill:'science',cost:160,desc:'Create a beverage no human can refuse.',win:'The espresso powers entire cities. Your coffee empire begins.',lose:'The espresso becomes sentient and demands overtime pay.'},{name:'Acquire the Bean Market',by:'kevin',skill:'finance',cost:180,desc:'Hostile takeover with extra foam.',win:'Kevin corners the regional bean market using a spreadsheet named FINAL_final_4.',lose:'He purchases 80,000 novelty mugs instead. They are not returnable.'},{name:'Launch Coffee Propaganda',by:'chaos',skill:'deception',cost:90,desc:'Convince everyone your coffee is essential.',win:'Your jingle becomes unavoidable. Rivals plead for mercy.',lose:'CHAOS-9000 accidentally makes decaf fashionable. Catastrophe.'}]},
];

const AVAILABLE_TOOLS = CHARACTERS.map(character => character.skill);

function createFreshGame() {
  return {money:600,heat:8,infamy:0,day:1,wins:0,losses:0,loyalty:Object.fromEntries(CHARACTERS.map(c=>[c.id,c.loyalty])),log:['Day 1: Evil Genius Incorporated established. No refunds.'],completed:[]};
}

function chooseOfflineSpecialist(plan, availableTools = AVAILABLE_TOOLS) {
  if (!plan || !availableTools.includes(plan.skill)) throw new Error('Plan specialist is unavailable');
  return {provider:'deterministic demo',choice:plan.skill,confidence:null};
}

function acceptDecisionChoice(decision, plan, availableTools = AVAILABLE_TOOLS) {
  if (decision?.provider === 'decider' && availableTools.includes(decision.choice)) return decision;
  return chooseOfflineSpecialist(plan, availableTools);
}

function resolveMission(state, mission, planIndex, selectedSkill, options = {}) {
  const plan = mission?.plans?.[planIndex];
  if (!plan) throw new Error('Unknown mission plan');
  if (state.money < plan.cost) throw new Error('Insufficient funds');
  const assigned = CHARACTERS.find(c=>c.skill===selectedSkill) || CHARACTERS.find(c=>c.id===plan.by);
  const match = assigned.skill === plan.skill;
  const assignedLoyalty = state.loyalty[assigned.id];
  const luck = options.luck ?? (state.day*37 + state.infamy*11 + plan.cost*3 + assignedLoyalty*7 + planIndex*19)%100;
  const threshold = Math.max(15,Math.min(90,35+assignedLoyalty*.45-state.heat*.18+(match?14:-18)));
  const win = luck < threshold;
  const next = {...state,loyalty:{...state.loyalty},completed:[...(state.completed||[])]};
  next.money -= plan.cost;
  if(win){next.money+=mission.reward;next.wins++;next.infamy+=9+planIndex*3}else{next.losses++;next.infamy+=2}
  const heatAdded=mission.heat+(win?4:8);
  next.heat=Math.min(100,next.heat+heatAdded);
  next.loyalty[assigned.id]=Math.max(10,Math.min(100,assignedLoyalty+(win?5:-6)));
  next.day++;
  const events=[];
  if(next.heat>=100){next.heat=35;next.money=Math.max(100,next.money-120);events.push('Government investigators raided the lair. They found only unpaid parking tickets. -$120.')}
  if(next.money<60){next.money+=120;events.push('Emergency funding secured by selling suspiciously signed autographs. +$120.')}
  let story=win?plan.win:plan.lose;
  if(!match)story+=` ${assigned.name} took over the mission instead, and the plan suffered a coordination penalty.`;
  return {state:next,win,story,reward:win?mission.reward:0,infamy:win?9+planIndex*3:2,cost:plan.cost,heat:heatAdded,assigned,match,luck,threshold,events};
}

const EvilGeniusEngine={AVAILABLE_TOOLS,CHARACTERS,MISSIONS,acceptDecisionChoice,chooseOfflineSpecialist,createFreshGame,resolveMission};
if(typeof window!=='undefined')window.EvilGeniusEngine=EvilGeniusEngine;
if(typeof module!=='undefined'&&module.exports)module.exports=EvilGeniusEngine;
