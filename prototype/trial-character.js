'use strict';
(() => {
  const D=window.GameData,K=window.CharacterData;
  Object.assign(D.cards,{
    ria_focus:{name:'한 점을 꿰는 탄환',role:2,kind:'attack',power:32,time:4.5,prep:.35,limit:3,source:'base',traits:['pursuit'],purposeMode:'compatible',desc:'적 하나에게 피해 32 · 속사보다 강하지만 다음 명령까지 4.5초'},
    ria_burst:{name:'세 번의 약속',role:2,kind:'attack',power:14,time:7,prep:.5,limit:1,source:'reward',traits:['resonance'],purposeMode:'compatible',desc:'적 하나에게 14 피해씩 3연사 · 시전자 또는 대상이 쓰러지면 후속 사격 중단'},
    ria_cover:{name:'네 뒤의 사선',role:2,kind:'ward',power:24,time:5,prep:.2,duration:4,limit:2,source:'reward',traits:['escort'],purposeMode:'replace',desc:'동료 곁으로 이동해 보호막 24 · 4초간 피해 25% 분담과 반격 1회 · 저격 위치를 포기함'}
  });
  K.registerCharacter({id:'ria',playable:true,role:2,name:'리아',tag:'고정 표적을 꿰뚫는 저격수',base:['ria_focus'],reward:['ria_burst','ria_cover'],stances:['기동','집중'],line:'한 번 정한 목표는, 끝까지.',desc:'긴 사거리에서 같은 적을 세 번 실제로 맞히면 추가 피해 8. 이동과 기본 사격은 느려 다수의 작은 적을 옮겨 다니는 전투에 불리합니다.',basicProfile:{range:290,speed:38,damage:3.8,period:2.6},passive:{type:'repeatHit',hits:3,power:8}});
  K.registerSkill('ria_burst',{type:'comboStrike',target:'enemy',offsets:[.22,.44],recovery:.6,reason:'같은 표적 3연사'});
  K.registerSkill('ria_cover',{type:'coverWard',target:'otherAlly',counterPower:12,reason:'저격 위치를 포기하고 동료 엄호'});
  for(const key of ['ria_focus','ria_burst','ria_cover'])K.setCasterRule(key,{characterId:'ria'});
  window.TrialCharacter={party(id='ranger'){const p=K.defaultParty();p[2].characterId=id;return p;},template(template,id){const result={...template};if(id==='ria'&&result.shot&&!result.ria_focus){result.ria_focus=(result.ria_focus||0)+result.shot;delete result.shot;}if(id==='ranger'&&result.ria_focus){result.shot=(result.shot||0)+result.ria_focus;delete result.ria_focus;}return result;}};
})();
