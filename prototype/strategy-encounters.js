'use strict';
(()=>{
 const K=window.CharacterData;
 // New normal expeditions opt into these profiles; old runs/challenges keep theirs.
 K.strategyBattles={...K.tacticalBattles,
  3:{...K.tacticalBattles[3],hint:'다섯 근접 적의 빠른 기본 공격이 쌓입니다. 화살비·직선 공격으로 함께 줄이거나, 차단·반격·전체 회복과 밀치기로 전열을 유지하세요. 오래 버티기만 하면 공격을 집중해서 받습니다.',threat:'다섯 근접 적의 빠른 압박 · 범위 카드 공격',responses:['광역·연계 공격으로 수 줄이기','차단·반격·회복으로 전열 유지'],tradeoff:'단일 추격만 편성하면 여러 적을 정리하는 동안 체력이 소모됩니다.',enemies:K.tacticalBattles[3].enemies.map(e=>({...e,damage:7.2,period:1.4}))},
  6:{...K.tacticalBattles[6],hint:'빠른 후열 사격을 전열 차단과 치유사가 지원합니다. 치유사·사수를 집중 제거하거나 광역·직선 공격으로 지원망을 함께 끊으세요. 밀집한 위치에는 고정 폭발이 들어옵니다.',threat:'빠른 후열 사격 + 회복 지원 · 밀집 위치 고정 폭발',responses:['추격·집중 공격으로 후열 제거','광역·직선 공격 + 차단·회복'],tradeoff:'방어만 계속하면 회복 지원과 사격이 누적됩니다. 분산하면 근처 보호가 약해집니다.',enemies:K.tacticalBattles[6].enemies.map((e,i)=>({...e,...(i===0?{damage:5.5,period:1.4}:i===1?{hp:110,period:1.3}:{damage:9,period:1.4})}))},
  7:{...K.tacticalBattles[7],hint:'개전 12초 동안 빠른 돌격수가 지원가를 추격합니다. 도발·엄호·회복으로 지원가를 유지하거나 돌격수를 집중 공격·밀치기로 제거하세요. 단일 카드 압박은 개전 이후에도 이어집니다.',threat:'개전 지원가 추격 · 빠른 기본 공격과 긴 강공격',responses:['도발·근처 보호·엄호로 지원가 유지','집중 공격·밀치기로 돌격수 제거'],tradeoff:'지원가를 멀리 빼면 접근이 늦지만 보호 범위도 멀어집니다.',enemies:K.tacticalBattles[7].enemies.map((e,i)=>({...e,...(i===1?{damage:16.5,period:1.1}:{damage:5.5,period:1.4})}))}
 };
 K.strategyBoss={...K.phasedBoss,hint:'7초 주기의 원형 낙하 뒤 HP 50%에서 8초 주기의 부상자 중심 직선 공격으로 바뀝니다. 차단·보호·회복 또는 이동 카드로 대응하고 빈틈에 공격하세요. 모든 위험을 무료로 회피하지 않습니다.',threat:'낙하 7초 → HP 50% 직선 8초 · 반복 강공격',responses:['차단·보호·회복 후 빈틈 공격','구출·재배치 + 집중 공격'],tradeoff:'공격만 이어가면 전열 체력이 소모되고, 방어만 이어가면 처치가 늦어집니다.',mechanic:{...K.phasedBoss.mechanic,power:95,interval:7},phase2:{...K.phasedBoss.phase2,power:70,interval:8}};
 K.expeditionBosses={fall:K.strategyBoss,network:{
  name:'등불 지휘소',profileVersion:1,defensiveEnemy:true,strategy:'sustain',
  hint:'전열 지휘관의 차단 뒤에서 치유사와 사수가 지원합니다. 단일 추격으로 지원자를 먼저 끊거나 광역·직선 공격으로 지원망을 함께 압박하세요. 도발과 보호·회복으로 사격을 버티는 동안 공격할 준비도 필요합니다.',
  threat:'전열 차단 + 후열 회복·지속 사격 · 위험 구역 없음',
  responses:['추격·연계로 후열 지원자 제거','광역·직선 압박 + 보호·회복'],
  tradeoff:'버티기만 하면 적 회복과 사격이 누적됩니다. 밀착 보호·주변 회복은 분산 배치와 충돌할 수 있습니다.',
  enemies:[{role:0,name:'등불 지휘관',hp:205,damage:5.2,period:1.8,x:635,y:190,cards:['guard','bash','taunt']},{role:3,name:'지휘소 치유사',hp:100,damage:3,period:2,x:805,y:115,cards:['heal','wave']},{role:2,name:'지휘소 사수',hp:105,damage:7,period:1.7,x:810,y:260,cards:['shot','pierce']}]
 }};
 // Independent public encounter stream: never consumes route, reward or combat randomness.
 K.bossForSeed=seed=>{const rng=new window.GameData.Random((seed^0xa5b35719)>>>0);for(let i=0;i<4;i++)rng.next();return rng.pick(['fall','network']);};
})();
