'use strict';
(()=>{
  const D=window.GameData,K=window.CharacterData;
  const presets={base:{name:'기초 키트',desc:'돌진·간격 베기·받아치기·잔광 검무로 싸웁니다.'},chase:{name:'추격 보상',desc:'기초 카드 2장을 이어지는 섬광으로 교체합니다. 처치 후 추가 돌진을 관찰하세요.'},cover:{name:'엄호 보상',desc:'기초 카드 2장을 너의 곁으로로 교체합니다. 동료 곁의 보호와 반격을 관찰하세요.'}};
  function create(preset){
    if(!presets[preset])throw Error('체험 구성을 선택하세요.');
    const {pool,ids}=K.templatePool(K.starter),cards=ids.map((id,i)=>({...pool.find(c=>c.id===id),id:'trial:'+i}));
    if(preset!=='base'){const key=preset==='chase'?'serin_chain':'serin_cover';for(const old of ['serin_cut','serin_dash']){const i=cards.findIndex(c=>c.key===old);cards[i]={id:cards[i].id,key,characterId:'serin',source:'reward',upgraded:false};}}
    const encounter={...D.encounters[1],enemies:[{...D.encounters[1].enemies[0],hp:150},{...D.encounters[1].enemies[1],hp:180}]};
    const b=new window.CharacterBattle({seed:37,levels:[1,1,1,1],hp:[140,115,95,48],stances:[0,1,0,0],depth:0,elite:false,encounter,timing:'mixed',control:'auto',openingKey:'serin_dance',cards});
    b.get('e0').hp=55;return b;
  }
  window.TrialCore={create,presets,duration:45};
})();
