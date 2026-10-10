(function(root){
  'use strict';
  const DIRECTIONS={north:{dx:0,dy:-1,opposite:'south',label:'북쪽',arrow:'↑'},east:{dx:1,dy:0,opposite:'west',label:'동쪽',arrow:'→'},south:{dx:0,dy:1,opposite:'north',label:'남쪽',arrow:'↓'},west:{dx:-1,dy:0,opposite:'east',label:'서쪽',arrow:'←'}};
  const BIOMES=[{id:'hospital',name:'빛이 남은 병원',scene:'수술실 너머에서 빛이 새어 나온다.',color:'#8cd7ce'},{id:'city',name:'잠긴 도시',scene:'비가 오르던 거리에는 발자국만 남아 있다.',color:'#d3a077'},{id:'station',name:'마지막 역',scene:'도착한 적 없는 열차의 방송이 반복된다.',color:'#b7a1e4'}];
  function hash(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){let s=seed||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>=0)/4294967296;};}
  function distances(map,start){const result={[start]:0},queue=[start];for(let i=0;i<queue.length;i++)for(const next of Object.values(map.nodes.find(n=>n.id===queue[i]).exits))if(result[next]===undefined){result[next]=result[queue[i]]+1;queue.push(next);}return result;}
  function path(map,start,end){const queue=[start],previous={[start]:null};for(let i=0;i<queue.length;i++){if(queue[i]===end)break;for(const next of Object.values(map.nodes.find(n=>n.id===queue[i]).exits))if(previous[next]===undefined){previous[next]=queue[i];queue.push(next);}}if(previous[end]===undefined)return [];const result=[];for(let n=end;n!==null;n=previous[n])result.unshift(n);return result;}
  function validate(map,minDistance){
    if(!map||!Array.isArray(map.nodes)||map.nodes.length<minDistance+1||map.nodes.length>400)throw Error('맵 노드 오류');
    const index=new Map(map.nodes.map(n=>[n.id,n])),positions=new Set();
    if(index.size!==map.nodes.length||!index.has(map.entry)||!index.has(map.exit)||map.entry===map.exit)throw Error('맵 연결구 오류');
    for(const n of map.nodes){
      const pos=`${n.x},${n.y}`;if(!Number.isInteger(n.x)||!Number.isInteger(n.y)||positions.has(pos)||!n.exits||!Array.isArray(n.interactions)||!['entry','room','exit'].includes(n.kind))throw Error('맵 위치 오류');positions.add(pos);
      if(typeof n.visited!=='boolean'||n.interactions.some(i=>!i.id||!['cache','record','workbench','shelter'].includes(i.kind)||typeof i.resolved!=='boolean'||!Number.isInteger(i.gold)||i.gold<0))throw Error('맵 조사 상태 오류');
      if(n.encounter&&(!Array.isArray(n.encounter.patterns)||typeof n.encounter.mandatory!=='boolean'||typeof n.encounter.cleared!=='boolean'||!n.encounter.patterns.length||n.encounter.patterns.some(p=>!['hunter','sweep','sentinel','leech','warder','mender','pursuer','boss','tideheart','abyssjudge'].includes(p))))throw Error('맵 조우 오류');
      for(const [direction,id]of Object.entries(n.exits)){const d=DIRECTIONS[direction],target=index.get(id);if(!d||!target||target.x!==n.x+d.dx||target.y!==n.y+d.dy||target.exits[d.opposite]!==n.id)throw Error('화살표 연결 오류');}
    }
    if(index.get(map.entry).kind!=='entry'||index.get(map.exit).kind!=='exit'||!index.get(map.exit).encounter?.mandatory)throw Error('연결구 수문장 오류');
    const d=distances(map,map.entry);if(Object.keys(d).length!==map.nodes.length||d[map.exit]<minDistance)throw Error('최단거리 하한 위반');return d[map.exit];
  }
  function generateCandidate(seed,depth,minDistance=15){
    const random=rng(hash(`${seed}:map:${depth}`)),nodes=[],byPosition=new Map(),biomeOffset=hash(`${seed}:biome`)%BIOMES.length;
    const biome=BIOMES[(biomeOffset+depth-1)%BIOMES.length];
    const add=(x,y)=>{const id=`d${depth}:${x}:${y}`,n={id,x,y,kind:'room',exits:{},visited:false,interactions:[],encounter:null};nodes.push(n);byPosition.set(`${x},${y}`,n);return n;};
    const link=(a,b,dir)=>{a.exits[dir]=b.id;b.exits[DIRECTIONS[dir].opposite]=a.id;};
    let current=add(0,0);const entry=current;entry.kind='entry';entry.visited=true;
    const length=minDistance+Math.floor(random()*4);
    for(let i=0;i<length;i++){const dir=random()<.5?'east':'north',d=DIRECTIONS[dir],next=add(current.x+d.dx,current.y+d.dy);link(current,next,dir);current=next;}
    const exit=current;exit.kind='exit';
    for(let i=0;i<minDistance+8;i++){const parent=nodes[Math.floor(random()*nodes.length)],dir=Object.keys(DIRECTIONS)[Math.floor(random()*4)],d=DIRECTIONS[dir],x=parent.x+d.dx,y=parent.y+d.dy;let next=byPosition.get(`${x},${y}`);if(!next)next=add(x,y);link(parent,next,dir);}
    // All edges are adjacent grid cells; nevertheless validate the final graph,
    // including branch cycles, using BFS rather than just main-path length.
    for(const n of nodes){
      if(n===exit)n.encounter={patterns:[depth>=3?['boss','tideheart','abyssjudge'][Math.floor(random()*3)]:'sentinel'],mandatory:true,cleared:false};
      else if(n!==entry&&random()<.24)n.encounter={patterns:depth>=2&&random()<.4?['hunter',random()<.5?'warder':'mender']:[['hunter','sweep','leech','pursuer'][Math.floor(random()*4)]],mandatory:false,cleared:false};
      if(n===entry||random()<.72){const kind=n===entry?'record':['cache','record','workbench','shelter'][Math.floor(random()*4)];n.interactions.push({id:n.id+':object',kind,resolved:false,gold:kind==='cache'?6+depth*4+Math.floor(random()*7):2+depth,seed:hash(`${seed}:${n.id}:loot`)});}
    }
    if(!nodes.some(n=>n.encounter&&!n.encounter.mandatory))nodes[1].encounter={patterns:['hunter'],mandatory:false,cleared:false};
    const map={version:'exploration-map-1',depth,biomeId:biome.id,entry:entry.id,exit:exit.id,nodes,generation:{fallback:false,attempts:1}};
    validate(map,minDistance);return map;
  }
  function fallback(seed,depth,minDistance){
    const biome=BIOMES[(hash(`${seed}:biome`)%BIOMES.length+depth-1)%BIOMES.length],nodes=[];
    for(let x=0;x<=minDistance;x++)nodes.push({id:`d${depth}:${x}:0`,x,y:0,kind:x===0?'entry':x===minDistance?'exit':'room',exits:{...(x>0?{west:`d${depth}:${x-1}:0`}:{}),...(x<minDistance?{east:`d${depth}:${x+1}:0`}:{})},visited:x===0,interactions:x===0?[{id:`d${depth}:0:0:object`,kind:'record',resolved:false,gold:2+depth,seed:hash(seed+':fallback')}]:[],encounter:x===minDistance?{patterns:[depth>=3?'boss':'sentinel'],mandatory:true,cleared:false}:x===1?{patterns:['hunter'],mandatory:false,cleared:false}:null});
    const map={version:'exploration-map-1',depth,biomeId:biome.id,entry:nodes[0].id,exit:nodes.at(-1).id,nodes,generation:{fallback:true,attempts:1,reason:'candidate-validation-failed'}};validate(map,minDistance);return map;
  }
  function generate(seed,depth,minDistance=15){
    if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(depth)||depth<1||depth>3||!Number.isInteger(minDistance)||minDistance<3||minDistance>40)throw Error('맵 생성 설정 오류');
    try{return generateCandidate(seed,depth,minDistance);}catch(error){const map=fallback(seed,depth,minDistance);map.generation.reason=error.message;return map;}
  }
  function hint(map,currentId){const current=map.nodes.find(n=>n.id===currentId),exit=map.nodes.find(n=>n.id===map.exit);if(current.id===exit.id)return '바로 이곳입니다. 연결구 반응이 확인됩니다.';const horizontal=exit.x>current.x?'동':exit.x<current.x?'서':'',vertical=exit.y<current.y?'북':exit.y>current.y?'남':'',bearing=vertical+horizontal;const route=path(map,currentId,map.exit),first=map.nodes.find(n=>n.id===route[1]);const away=first&&(Math.abs(first.x-exit.x)+Math.abs(first.y-exit.y)>Math.abs(current.x-exit.x)+Math.abs(current.y-exit.y));return `${bearing}쪽 구역에서 연결구 반응이 확인됩니다.${away?' 직행 경로는 확인되지 않았습니다.':''}`;}
  const api={DIRECTIONS,BIOMES,hash,rng,distances,path,validate,generate,fallback,hint};if(typeof module!=='undefined')module.exports=api;root.ExplorationMap=api;
})(typeof globalThis!=='undefined'?globalThis:this);
