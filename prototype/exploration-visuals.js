(function(root){
  'use strict';
  const PLACES={corridor:{name:'비상등이 남은 복도',mapLabel:'비상등 복도',description:'붉은 비상등 아래로 긴 복도가 이어진다.'},records:{name:'간호사 대기실',mapLabel:'간호사실',description:'낮은 책상과 기록물 선반이 남아 있다.'},theatre:{name:'멈춘 수술실',mapLabel:'수술실',description:'수술등 아래 빈 쟁반과 수술대가 놓여 있다.'},ward:{name:'비어 있는 병실',mapLabel:'병실',description:'커튼 사이로 빈 침대와 작은 녹음기가 보인다.'},portal:{name:'연결구 앞의 홀',mapLabel:'연결구 홀',description:'기울어진 문틀 안에서 푸른 빛이 번진다.'}};
  function location(map,node){if(map.biomeId!=='hospital')return null;const event=map.roomEvents?.find(e=>e.node===node.id),id=node.kind==='exit'?'portal':event?.type==='surgery'?'theatre':event?.type==='cough'?'ward':node.interactions.some(i=>i.kind==='shelter')?'ward':node.interactions.some(i=>['record','workbench'].includes(i.kind))&&node.kind!=='entry'?'records':'corridor';return {id,...PLACES[id],background:'assets/exploration/hospital-'+id+'-bg.svg',props:'assets/exploration/hospital-'+id+'-props.svg',provisional:true};}
  const api={PLACES,location};if(typeof module!=='undefined')module.exports=api;root.ExplorationVisuals=api;
})(typeof globalThis!=='undefined'?globalThis:this);
