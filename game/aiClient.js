(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EvilGeniusAiClient=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function event(endpoint,outcome,reason){console.debug('evil_genius_ai',{endpoint,outcome,reason})}

  function fallback(endpoint,reason,until){
    event(endpoint,'fallback',reason);
    return {fallback:true,reason,...(until===undefined?{}:{until})};
  }

  async function sha256Hex(text){
    const bytes=new TextEncoder().encode(text);
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function request(endpoint,payload,timeoutMs,options={}){
    const fetchImpl=options.fetchImpl||fetch;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort('timeout'),options.timeoutMs??timeoutMs);
    const external=options.signal;
    const abort=()=>controller.abort(external?.reason||'cancelled');
    if(external){
      if(external.aborted)abort();
      else external.addEventListener('abort',abort,{once:true});
    }
    try{
      const serialized=JSON.stringify(payload);
      const headers={'Content-Type':'application/json','x-amz-content-sha256':await sha256Hex(serialized)};
      const response=await fetchImpl(endpoint,{method:'POST',headers,body:serialized,signal:controller.signal});
      let body,jsonError=false;
      try{body=await response.json()}catch{jsonError=true}
      if(response.status===429)return fallback(endpoint,'rate_limited',body?.until);
      if(response.status===503)return fallback(endpoint,'disabled');
      if(jsonError)return fallback(endpoint,'non_json');
      if(!response.ok)return fallback(endpoint,'error');
      if(controller.signal.aborted||external?.aborted)return fallback(endpoint,'cancelled');
      event(endpoint,'success','ok');
      return body;
    }catch(error){
      const reason=controller.signal.aborted&&controller.signal.reason==='timeout'?'timeout':(external?.aborted?'cancelled':'network_error');
      return fallback(endpoint,reason);
    }finally{
      clearTimeout(timer);
      if(external)external.removeEventListener('abort',abort);
    }
  }

  function decide(requestBody,options){return request('/api/decide',requestBody,95000,options)}
  function narrate(requestBody,options){return request('/api/narrate',requestBody,15000,options)}
  return {decide,narrate};
});
