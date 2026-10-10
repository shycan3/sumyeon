'use strict';
(()=>{
  const D=window.GameData;
  const tiers=Object.freeze({basic:Object.freeze({label:'기본',priority:1,duration:.55,portrait:false}),accent:Object.freeze({label:'강조',priority:2,duration:1.1,portrait:false}),signature:Object.freeze({label:'대표',priority:3,duration:1.4,portrait:true}),ultimate:Object.freeze({label:'궁극기',priority:4,duration:1.6,portrait:true})});
  const cards={
    serin_ultimate:{tier:'ultimate',style:'signature',pose:'dance',color:'#fff0bd',line:'이 새벽은, 우리 모두의 거야.',portrait:'assets/serin-portrait-v2.png'},
    ria_ultimate:{tier:'ultimate',style:'slash',pose:'default',color:'#d3c5ff',line:'흔들리지 않아. 이 한 발만은.',portrait:'assets/ria-portrait.svg'},
    ria_focus:{tier:'accent',style:'slash',pose:'default',color:'#a9a3f2',line:'조준은 끝났어.'},
    ria_burst:{tier:'signature',style:'signature',pose:'default',color:'#a9a3f2',line:'세 번이면 충분해.',portrait:'assets/ria-portrait.svg'},
    ria_cover:{tier:'accent',style:'cover',pose:'guard',color:'#a9a3f2',line:'내가 네 뒤에 있어.'},
    serin_cut:{tier:'basic',style:'slash',pose:'cut',color:'#d3fbff'},
    serin_dash:{tier:'accent',style:'dash',pose:'lunge',color:'#9be8dc',line:'놓치지 않을게.'},
    serin_parry:{tier:'accent',style:'ward',pose:'parry',color:'#f4d0ab',line:'와 봐. 이번엔 내가 받아줄게.'},
    serin_dance:{tier:'signature',style:'signature',pose:'dance',color:'#efc996',line:'한 줄기 빛이면 충분해.',portrait:'assets/serin-portrait-v2.png'},
    serin_chain:{tier:'accent',style:'chain',pose:'lunge',color:'#bdece3',line:'아직 끝나지 않았어.'},
    serin_cover:{tier:'accent',style:'cover',pose:'guard',color:'#edb3c7',line:'네 곁을 지킬게.'}
  };
  for(const [key,d]of Object.entries({...D.cards,...D.hostile})){const p=cards[key]||window.ContentAuthoring?.presentations[key]||{tier:'basic',style:['heal','healAll','cleanse','blessing'].includes(d.kind)?'heal':d.kind==='ward'||d.kind==='guard'?'ward':'slash',pose:'default',color:'#b7ded5'};cards[key]=Object.freeze({...p,title:d.name});}
  Object.freeze(cards);
  function profile(key){return cards[key]||Object.freeze({tier:'basic',style:'slash',pose:'default',color:'#b7ded5',title:'기술'});}
  window.SkillPresentation=Object.freeze({tiers,cards,profile});
})();
