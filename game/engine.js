// Mission writing follows GAME_VISION.md §3: character, consequence, clarity, and no real-world references.
const CHARACTERS = [
  {id:'mal',name:'Dr. Malpractice',icon:'🧪',job:'Unlicensed Science Officer',skill:'science',bio:'Has nine PhDs. Eight are suspicious.',loyalty:66},
  {id:'boris',name:'Boris the Brute',icon:'💪',job:'Director of Physical Solutions',skill:'force',bio:'Believes every problem can be punched.',loyalty:83},
  {id:'chaos',name:'CHAOS-9000',icon:'🤖',job:'Chief of Manipulation',skill:'deception',bio:'Can hack minds. Cannot use a printer.',loyalty:52},
  {id:'kevin',name:'Kevin from Accounting',icon:'📊',job:'Financial Warlock',skill:'finance',bio:'Expense reports are his weapon.',loyalty:94},
];

const NPC_STAFF = [
  {id:'dolores',name:'Dolores',icon:'📋',job:'Director of Human Resources',voice:'deadpan-hr',bio:'Can stop world domination with a mandatory meeting.'},
];

const MISSIONS = [
  {id:'moon',icon:'🌕',name:'Steal the Moon',desc:'A modest first step. One small theft for a villain, one enormous insurance claim for mankind.',reward:380,heat:18,plans:[{name:'Build a Tractor Beam',by:'mal',skill:'science',cost:210,desc:'Relocate the moon with questionable physics.',win:'Malpractice shifts the moon six inches, calls it a successful orbital correction, and requests funding for phase two.',lose:'Malpractice over-tunes the beam and relocates the lair\'s parking sign. The moon remains offensively stable.'},{name:'Install a Very Tall Ladder',by:'boris',skill:'force',cost:55,desc:'Send Boris to climb the entire atmosphere.',win:'Boris reaches a weather balloon, plants your flag, and reports that the moon requires a taller ladder.',lose:'Boris follows the climbing instructions literally and stops at the first missing rung. The moon remains unsecured.'},{name:'Purchase Moon Ownership',by:'kevin',skill:'finance',cost:95,desc:'Acquire rights through aggressively creative accounting.',win:'Kevin acquires the lunar rights through twelve shell companies, then whispers that the filing fees exceeded projections.',lose:'Kevin purchases mineral rights to a warehouse of moon rocks. His contingency spreadsheet confirms they are decorative.'}]},
  {id:'mondays',icon:'📅',name:'Outlaw Mondays',desc:'Eliminate the most universally disliked day. Revolutionary evil, surprisingly good polling.',reward:280,heat:12,plans:[{name:'Rewrite Every Calendar',by:'chaos',skill:'deception',cost:145,desc:'Confuse every calendar app in existence.',win:'Mondays disappear from 300 calendars. Workers celebrate. Economists panic.',lose:'Every day is now Monday. You have become the villain you swore to destroy.'},{name:'Threaten the Clock Tower',by:'boris',skill:'force',cost:75,desc:'Intimidate time itself.',win:'The mayor declares a symbolic No Monday holiday to make Boris leave.',lose:'Boris punches a clock. Time is unaffected. The clock files a complaint.'},{name:'Lobby for Four-Day Weekends',by:'kevin',skill:'finance',cost:90,desc:'Use paperwork as a tool of domination.',win:'Your labor proposal passes. Unexpectedly, you are now a folk hero.',lose:'Kevin accidentally schedules more Monday meetings. Morale hits a new low.'}]},
  {id:'coffee',icon:'☕',name:'Control All Coffee',desc:'Own the bean. Control the world. Ignore the fact that this is just retail.',reward:320,heat:15,plans:[{name:'Synthesize Evil Espresso',by:'mal',skill:'science',cost:160,desc:'Create a beverage no human can refuse.',win:'Malpractice creates an espresso powerful enough to run the distribution grid. He classifies the trembling as a minor side effect.',lose:'Malpractice gives the espresso a survival instinct. It escapes the cup before anyone can drink it.'},{name:'Acquire the Bean Market',by:'kevin',skill:'finance',cost:180,desc:'Hostile takeover with extra foam.',win:'Kevin corners the regional bean market using a spreadsheet named FINAL_final_4, then asks whether profit is supposed to feel this dangerous.',lose:'Kevin approves the wrong acquisition and takes delivery of 80,000 novelty mugs. His returns forecast contains only the word no.'},{name:'Launch Coffee Propaganda',by:'chaos',skill:'deception',cost:90,desc:'Convince everyone your coffee is essential.',win:'CHAOS-9000 raises compulsory-coffee sentiment by 73 percent. Rival vendors begin negotiating surrender.',lose:'CHAOS-9000 optimizes for positive beverage sentiment and makes decaf fashionable. Market control falls outside target parameters.'}]},
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

function maybeHrIntervention(state, mission) {
  if (state.heat < 85) return null;
  const next = {
    ...state,
    heat: Math.max(0,Math.min(100,state.heat-10)),
    day: state.day+1,
    loyalty: {...state.loyalty},
    log: [`Day ${state.day}: Dolores called a mandatory meeting. Mission postponed. -10% heat.`,...(state.log||[])],
    completed: [...(state.completed||[])],
  };
  return {state:next,event:'hr_intervention'};
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

const EvilGeniusEngine={AVAILABLE_TOOLS,CHARACTERS,NPC_STAFF,MISSIONS,acceptDecisionChoice,chooseOfflineSpecialist,createFreshGame,maybeHrIntervention,resolveMission};
if(typeof window!=='undefined')window.EvilGeniusEngine=EvilGeniusEngine;
if(typeof module!=='undefined'&&module.exports)module.exports=EvilGeniusEngine;
