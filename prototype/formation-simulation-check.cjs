'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','actor-ai','engine','campaign','character-engine','character-campaign'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const {CharacterBattle:B,CharacterData:K,GameData:D,Formation:F}=ctx.window,layouts=[F.recommended,[4,1,0,5],[0,3,4,5]],out=[];
const {pool,ids}=K.templatePool(K.starter),cards=ids.map(id=>pool.find(c=>c.id===id));
for(const [name,encounter] of [['wall',K.advancedBattles[6]],['rush',K.advancedBattles[7]],['elite',K.expeditionElite],['boss',K.phasedBoss]])for(const seed of [7,19,37])for(const policy of ['attack','protect'])for(const layout of layouts){
 const b=new B({formation:layout,seed,levels:[1,1,1,1],hp:D.roles.map((_,i)=>D.maxHP(i,1)),stances:[0,1,0,0],depth:name==='boss'?5:name==='elite'?4:2,elite:name==='elite',encounter,timing:'mixed',control:'auto',autoPolicy:policy,cards});
 for(let i=0;i<10000&&!b.s.ended;i++)b.step(.02);assert(b.s.ended,'bounded battle');assert(b.s.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.x>=35&&a.x<=925&&a.y>=35&&a.y<=355));out.push({name,seed,policy,layout:[...layout],win:b.s.winner===0,time:+b.s.t.toFixed(2),hp:+b.alive(0).reduce((n,a)=>n+a.hp,0).toFixed(2)});
}
let different=0;for(let i=0;i<out.length;i+=3)if(new Set(out.slice(i,i+3).map(r=>r.win+':'+r.time+':'+r.hp)).size>1)different++;
assert(different>0);const summary={battles:out.length,differentGroups:different,groups:out.length/3,layouts:layouts.map(layout=>({layout:[...layout],wins:out.filter(r=>JSON.stringify(r.layout)===JSON.stringify(layout)&&r.win).length,meanHP:+(out.filter(r=>JSON.stringify(r.layout)===JSON.stringify(layout)).reduce((n,r)=>n+r.hp,0)/(out.length/3)).toFixed(2)}))};fs.writeFileSync(__dirname+'/formation-simulation-results.json',JSON.stringify({summary,rows:out},null,2));console.log(summary);
