const assert=require('assert'),fs=require('fs'),vm=require('vm');
const context=vm.createContext({window:{}});
for(const file of ['data.js','engine.js','campaign.js'])vm.runInContext(fs.readFileSync(`${__dirname}/${file}`,'utf8'),context,{filename:file});
const D=context.window.GameData,C=context.window.GameCampaign,clone=value=>JSON.parse(JSON.stringify(value));
function fillCollection(c){for(const [key,d] of Object.entries(D.cards))while(c.meta.owned.filter(card=>card.key===key).length<d.limit)c.meta.owned.push({id:'o'+c.meta.serial++,key});}
function acquired(c,key,id='test-acquired'){const card={id,key,ownedId:null,upgraded:false,acquired:true};c.run.pool.push(card);return card;}
function pathTo(map,depth,type){
  const walk=(path)=>{const layer=path.length,nodes=layer?map[layer].filter(n=>map[layer-1].find(previous=>previous.id===path.at(-1)).next.includes(n.id)):map[0];for(const n of nodes){if(layer===depth){if(n.type===type)return [...path,n.id];}else{const found=walk([...path,n.id]);if(found)return found;}}};
  return walk([]);
}
{
  let restricted=0;
  for(let seed=1;seed<=200;seed++){
    const map=C.makeMap(seed);
    for(let depth=0;depth<9;depth++){
      for(const node of map[depth]){assert(node.next.length>0);assert(node.next.every(id=>map[depth+1].some(n=>n.id===id)));if(node.next.length<map[depth+1].length)restricted++;}
      for(const next of map[depth+1])assert(map[depth].some(n=>n.next.includes(next.id)));
    }
    assert(map[2].every(n=>n.next[0]===map[3][0].id));assert(map[6].every(n=>n.next[0]===map[7][0].id));
  }
  for(let seed=1;seed<=200;seed++){const map=C.makeMap(seed);for(const depth of [0,4])assert(map[depth].every(n=>n.next.length===2));for(const depth of [1,5])assert(map[depth].every(n=>n.next.length>=2&&n.next.includes(map[depth+1].find(x=>x.type==='heal').id)));}
  assert(restricted>0,'previous choices must constrain later choices');
  const c=new C.Campaign();c.start(42);const r=c.run;
  const previous=r.map[1].find(n=>n.next.length<r.map[2].length);assert(previous);
  r.depth=2;r.visited=[r.map[0][0].id,previous.id];const inaccessible=r.map[2].find(n=>!previous.next.includes(n.id));
  assert(!c.chooseNode(inaccessible.id));assert(c.chooseNode(C.availableNodes(r)[0].id));C.validateSave(c.snapshot());
  const legacy=clone(c.snapshot());legacy.run.map.flat().forEach(n=>delete n.next);delete legacy.meta.fragments;C.validateSave(legacy);assert.equal(legacy.meta.fragments,0);assert.equal(C.availableNodes(legacy.run).length,legacy.run.map[2].length);
  const bad=clone(c.snapshot());bad.run.map[0][0].next=['missing-node'];assert.throws(()=>C.validateSave(bad));
  const illegal=clone(c.snapshot());illegal.run.current=clone(inaccessible);assert.throws(()=>C.validateSave(illegal));
}
{
  for(let seed=1;seed<=100;seed++){
    const c=new C.Campaign();c.start(seed);const reward=c.reward({id:'elite',seed,type:'elite'});
    assert(reward.candidates.some(key=>D.cards[key].limit===1));assert.equal(reward.upgradedKeys.length,0);
    const normal=c.reward({id:'normal',seed,type:'battle'});assert(normal.candidates.every(key=>c.meta.owned.filter(card=>card.key===key).length<D.cards[key].limit));
  }
  const c=new C.Campaign();fillCollection(c);c.meta.owned=c.meta.owned.filter(card=>card.key!=='cleave'||card===c.meta.owned.find(x=>x.key==='cleave'));
  c.start(11);acquired(c,'cleave','pending-1');
  let reward=c.reward({id:'reward',seed:1,type:'reward'});assert(reward.candidates.includes('cleave'));assert(!reward.overflowKeys.includes('cleave'));
  acquired(c,'cleave','pending-2');reward=c.reward({id:'reward',seed:1,type:'reward'});assert.deepEqual(clone(reward.upgradedKeys),clone(reward.candidates));
  c.run.reward=reward;c.run.stage='reward';assert(c.pickReward(reward.candidates[0]));assert(c.run.pool.at(-1).upgraded);
}
{
  const c=new C.Campaign();c.start(5);const duplicate=acquired(c,'dash'),newCard=acquired(c,'ward','new-card'),count=c.meta.owned.length;
  assert.equal(c.secure(),1);assert(duplicate.converted&&!duplicate.ownedId);assert(newCard.ownedId);assert.equal(c.meta.fragments,1);assert.equal(c.meta.owned.length,count+1);
  assert.equal(c.secure(),0);assert.equal(c.meta.fragments,1);C.validateSave(c.snapshot());
  acquired(c,'pierce','lost-card');c.abandon();assert.equal(c.meta.lastReport.secured,1);assert.equal(c.meta.lastReport.converted,1);assert.equal(c.meta.lastReport.fragments,1);assert.equal(c.meta.lastReport.lost,1);
  const restored=new C.Campaign(clone(c.snapshot()));C.validateSave(restored.snapshot());assert.equal(restored.meta.fragments,1);
  restored.meta.fragments=3;const before=restored.meta.owned.length;assert.equal(restored.exchange('cleave'),'');assert.equal(restored.meta.fragments,0);assert.equal(restored.meta.owned.length,before+1);assert(restored.exchange('cleave'));restored.meta.fragments=3;assert(restored.exchange('dash'));
  restored.start(9);assert(restored.exchange('cleave'));const invalid=clone(restored.snapshot());invalid.meta.fragments=-1;assert.throws(()=>C.validateSave(invalid));
  const older=C.fresh();older.meta.owned.push({id:'o'+older.meta.serial++,key:'dash'});delete older.meta.fragments;C.validateSave(older);assert.equal(older.meta.owned.filter(card=>card.key==='dash').length,4);
}
{
  const c=new C.Campaign();c.start(15);const path=pathTo(c.run.map,2,'elite');assert(path);c.run.depth=2;c.run.visited=path.slice(0,2);assert(c.chooseNode(path.at(-1)));
  c.battle.get('a0').hp=0;c.battle.get('a1').hp=30;c.battle.get('a2').hp=50;c.battle.get('a3').hp=90;c.battle.s.actors.filter(a=>a.side===1).forEach(a=>a.hp=0);c.battle.checkEnd();assert(c.observeBattle());
  assert.equal(c.run.stage,'elitePerk');assert.equal(c.run.hp[1],30);C.validateSave(c.snapshot());
  const restored=new C.Campaign(clone(c.snapshot()));assert(restored.chooseElitePerk('evolve'));assert.equal(restored.run.hp[1],30);assert(restored.openReward());assert(restored.pickReward(restored.run.reward.candidates[0]));assert(restored.run.pool.at(-1).upgraded);C.validateSave(restored.snapshot());
  assert(c.chooseElitePerk('recover'));assert(!c.chooseElitePerk('evolve'));assert.equal(c.run.hp[0],0);assert.equal(c.run.hp[1],30+D.maxHP(1,1)*.12);assert.equal(c.run.hp[3],D.maxHP(3,1));assert(c.openReward());assert(c.pickReward(c.run.reward.candidates[0]));assert(!c.run.pool.at(-1).upgraded);C.validateSave(c.snapshot());
}
{
  const c=new C.Campaign();c.start(20);const before=c.meta.owned.length;assert(c.finish(true,'test'));assert.equal(c.meta.owned.length,before+1);assert.equal(c.meta.lastReport.bonusKeys.length,1);assert.equal(D.cards[c.meta.lastReport.bonusKeys[0]].limit,1);assert.equal(c.meta.lastReport.secured,1);assert.equal(c.meta.history[0].secured,c.meta.lastReport.secured);C.validateSave(c.snapshot());
  const saturated=new C.Campaign();fillCollection(saturated);saturated.start(21);acquired(saturated,'dash');saturated.finish(true,'test');assert.equal(saturated.meta.fragments,4);assert.equal(saturated.meta.lastReport.fragments,4);assert.equal(saturated.meta.lastReport.converted,1);assert.equal(saturated.meta.lastReport.lost,0);assert.equal(saturated.meta.lastReport.bonusKeys.length,0);C.validateSave(saturated.snapshot());
}
{
  const c=new C.Campaign();fillCollection(c);c.meta.fragments=3;assert.equal(c.prepareOpening('heavy'),'');assert.equal(c.meta.fragments,0);C.validateSave(c.snapshot());
  assert.equal(c.prepareOpening('heal'),'');assert.equal(c.meta.fragments,0);assert.equal(c.prepareOpening(null),'');assert.equal(c.meta.fragments,3);
  assert.equal(c.prepareOpening('heavy'),'');
  const oldDeck=[...c.meta.deck],heavyIds=c.meta.owned.filter(card=>card.key==='heavy'&&oldDeck.includes(card.id)).map(c=>c.id),extra=c.meta.owned.filter(card=>!oldDeck.includes(card.id)&&card.key!=='heavy').slice(0,heavyIds.length).map(c=>c.id);
  assert.equal(c.setDeck([...oldDeck.filter(id=>!heavyIds.includes(id)),...extra]),'');assert.equal(c.meta.openingKey,null);assert.equal(c.meta.fragments,3);
  assert.equal(c.setDeck(oldDeck),'');assert.equal(c.prepareOpening('heavy'),'');c.start(123);assert.equal(c.meta.openingKey,null);assert(c.prepareOpening('heal'));
  c.chooseNode(C.availableNodes(c.run)[0].id);assert(c.battle.s.decks[0].hand.some(c=>c.key==='heavy'));assert(c.run.openingUsed);assert.equal(c.meta.fragments,0);
  const resumed=new C.Campaign(clone(c.snapshot()));assert.deepEqual(clone(resumed.battle.snapshot()),clone(c.battle.snapshot()));C.validateSave(resumed.snapshot());
}
console.log('PASS: recovery forks/legacy saves, exclusive elite perks, duplicate conversion, exchanges, opening-hand reservations/refunds/resume, checkpoint idempotence, completion bonus and saturated collections.');
