'use strict';
(()=>{
  const key='afterglow-presentation-v1',defaults=Object.freeze({version:1,mode:'full',frequency:'highlights',volume:.6}),modes=['full','simple','off'],frequencies=['all','highlights','once'];
  function load(){try{const value=JSON.parse(window.localStorage?.getItem(key)||'null');if(value?.version===1&&modes.includes(value.mode)&&frequencies.includes(value.frequency))return {...value,volume:Number.isFinite(value.volume)&&value.volume>=0&&value.volume<=1?value.volume:defaults.volume};}catch(e){}return {...defaults};}
  function save(value){if(value.volume!==undefined&&(!Number.isFinite(value.volume)||value.volume<0||value.volume>1))return false;if(!modes.includes(value.mode)||!frequencies.includes(value.frequency))return false;try{window.localStorage?.setItem(key,JSON.stringify({version:1,mode:value.mode,frequency:value.frequency,volume:value.volume??load().volume}));return !!window.localStorage;}catch(e){return false;}}
  window.PresentationSettings=Object.freeze({key,defaults,load,save,frequencies:Object.freeze(frequencies)});
})();
