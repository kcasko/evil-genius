(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EvilGeniusAiStatus=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TTL_MS=60000;
  const PROBE_TIMEOUT_MS=10000;
  let status={mode:'pending',reason:'pending'};
  let checkedAt=0;
  let pending=null;

  function getAiStatus(){return {...status}}

  function setAiStatus(next){
    status={mode:next.mode,reason:next.reason,...(next.until===undefined?{}:{until:next.until})};
    checkedAt=Date.now();
    return getAiStatus();
  }

  function normalizeUntil(value){
    const number=Number(value);
    if(!Number.isFinite(number)||number<=0)return undefined;
    return number<1e11?number*1000:number;
  }

  function statusFromHealth(response,body){
    const until=normalizeUntil(body?.until);
    if(response.status===429)return {mode:'degraded',reason:'rate_limited',...(until===undefined?{}:{until})};
    if(response.status===503||body?.ai_enabled===false)return {mode:'offline',reason:'disabled'};
    if(response.ok)return {mode:'live',reason:'ok'};
    return {mode:'offline',reason:'error'};
  }

  async function runProbe(fetchImpl){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),PROBE_TIMEOUT_MS);
    try{
      const response=await fetchImpl('/api/health',{signal:controller.signal});
      let body=null;
      try{body=await response.json()}catch{}
      return setAiStatus(statusFromHealth(response,body));
    }catch{
      status={mode:'offline',reason:'error'};
      checkedAt=0;
      return getAiStatus();
    }finally{clearTimeout(timer);pending=null}
  }

  function probeAiAvailability(fetchImpl=fetch){
    if(pending)return pending;
    if(checkedAt&&Date.now()-checkedAt<TTL_MS)return Promise.resolve(getAiStatus());
    pending=runProbe(fetchImpl);
    return pending;
  }

  function refreshAiStatus(fetchImpl=fetch){
    checkedAt=0;
    pending=null;
    return probeAiAvailability(fetchImpl);
  }

  function resetAiStatusForTests(){status={mode:'pending',reason:'pending'};checkedAt=0;pending=null}

  return {TTL_MS,PROBE_TIMEOUT_MS,getAiStatus,setAiStatus,probeAiAvailability,refreshAiStatus,resetAiStatusForTests};
});
