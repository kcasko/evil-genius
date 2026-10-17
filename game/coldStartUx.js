(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EvilGeniusColdStartUx=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function coldStartProgress(startedAt,now=Date.now(),targetMs=90000){
    return Math.max(0,Math.min(100,((now-startedAt)/targetMs)*100));
  }
  return {coldStartProgress};
});
