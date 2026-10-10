(function(root){
  'use strict';
  const M=typeof module!=='undefined'?require('./exploration-map.js'):root.ExplorationMap;
  const DEFINITIONS={
    residue:{id:'residue',name:'잔류',shieldRetention:.5,description:'아군·적의 라운드 종료 후 남은 보호를 50% 유지한다(소수 버림). 등대지기의 보호 이월과는 더 큰 값만 적용한다.'},
    excess:{id:'excess',name:'과잉',damageBonus:2,description:'아군 카드의 각 직접 타격과 적의 각 공격에 피해 +2. 노출·약화 계산 뒤에 적용하며 기본 공격·반격 피해는 증가하지 않는다.'},
    stasis:{id:'stasis',name:'정체',inspectReduction:1,regenMultiplier:.5,description:'조사와 비전투 사건 선택의 시간 비용 −1(최소 0). 탐험 시간으로 얻는 자연 회복은 50%. 이동·교전·하강 비용과 초과 HP 단가는 그대로다.'}
  };
  const ORDER=['stasis','residue','excess'];
  function assign(seed,depth){return ORDER[(M.hash(seed+':law')%ORDER.length+depth-1)%ORDER.length];}
  function get(id){if(id===null||id===undefined)return null;if(!DEFINITIONS[id])throw Error('심층 법칙 오류');return DEFINITIONS[id];}
  function initialize(run,map){map.lawId=run.lawVersion===1?assign(run.seed,map.depth):null;}
  function inspectCost(run,base=run.config.inspectCost){const law=get(run.map.lawId);return Math.max(0,base-(law?.inspectReduction||0));}
  function regenRate(run){return run.config.regenRate*(get(run.map.lawId)?.regenMultiplier??1);}
  function details(run){const law=get(run.map.lawId);if(!law)return ['이전 저장의 진행 중 원정에는 법칙을 소급 적용하지 않습니다. 다음 입수부터 새 법칙이 적용됩니다.'];return [law.description,...(law.id==='stasis'?[`현재 조사 비용 ${inspectCost(run)}시간, 시간당 자연 회복 최대 HP의 ${(regenRate(run)*100).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}%. 명시적인 카드·시설 회복은 변하지 않습니다.`]:[]),'이번 심층에만 적용하는 시험 법칙입니다. 수치와 출현 분포는 최종 설정이 아닙니다.'];}
  const api={DEFINITIONS,assign,get,initialize,inspectCost,regenRate,details};if(typeof module!=='undefined')module.exports=api;root.ExplorationLaws=api;
})(typeof globalThis!=='undefined'?globalThis:this);
