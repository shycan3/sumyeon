(function(root){
  'use strict';
  const ENCOUNTERS=root.PartyExpeditionEncounters||require('./party-expedition-encounters.js');
  const COUNTER={
    hunter:'집중 공격은 표시된 동료에게 모입니다. 대상 보호·약화로 받아내거나 적 처치로 행동을 끊으세요.',
    sweep:'전체 공격은 각 동료가 따로 맞습니다. 전원 보호나 약화가 단일 보호보다 효율적일 수 있습니다.',
    sentinel:'초반 보호와 준비 강타가 핵심입니다. 보호 제거·관통을 쓰거나, 준비 턴에 다음 표적을 보호하세요.',
    leech:'HP 비율이 낮은 동료를 노립니다. 표적을 확인하고, 준비된 큰 공격 전에 약화·보호·처치를 고르세요.',
    conductor:'전체 공격과 집중 공격이 이어집니다. 현재 전체 피해와 다음 집중 표적을 각각 확인하세요.',
    warder:'공격 대신 동료를 보호하는 턴이 있습니다. 지원 적을 먼저 제거할지, 보호된 적을 우회할지 비교하세요.',
    mender:'회복 대상과 다음 라운드 회복량이 미리 공개됩니다. 지원자를 끊거나 회복 대상을 먼저 처치할 수 있습니다.',
    pursuer:'표시된 두 동료가 각각 공격받고 뒤이어 전체 공격이 옵니다. 한 명만 보호해선 두 타격을 모두 막지 못합니다.',
    bellkeeper:'보호를 두른 뒤 강한 단일 공격을 합니다. 현재 보호를 벗길지, 공격 대상과 다음 행동을 준비할지 고르세요.',
    twins:'두 적이 따로 공격하고, 정해진 순서 뒤 전체 공격을 준비합니다. 두 적의 체력과 예고를 함께 살피세요.',
    relay:'동료 보호·집중 공격·광역 준비가 이어집니다. 지원 효과와 예고 피해 중 어느 쪽을 먼저 끊을지 정하세요.',
    boss:'집중 공격과 전체 공격, 준비 행동을 번갈아 사용합니다. 보스와 동행 적의 예고를 각각 확인하세요.',
    tideheart:'보호를 두르고 노출을 남기는 준비를 반복합니다. 노출이 열린 뒤 큰 공격을 맞추고, 동행 적의 행동도 계산하세요.',
    abyssjudge:'체력 절반 이하에서 침수 국면으로 바뀝니다. 이미 공개된 행동은 유지되므로 국면 전환 전후의 예고를 확인하세요.'
  };
  const INTENT={
    attack:'표시된 동료 한 명을 공격',area:'살아 있는 모든 동료를 공격',volley:'표시된 두 동료를 각각 공격',
    prepare:'다음 라운드 행동을 준비',ward:'표시된 적에게 보호를 제공',heal:'표시된 적을 회복'
  };
  function lookup(pattern){const enemy=ENCOUNTERS.ENEMIES[pattern];if(!enemy)return null;return {pattern,name:enemy.name,threat:enemy.threat,counter:COUNTER[pattern]||enemy.threat};}
  function intent(intent,allies=[]){
    if(!intent)return '';
    const name=id=>allies.find(a=>a.id===id)?.name||'지정 대상';
    if(intent.type==='prepare'){
      const next=INTENT[intent.nextType]||'행동';
      const target=intent.nextTarget?` · 대상 ${name(intent.nextTarget)}`:intent.nextTargets?.length?` · 대상 ${intent.nextTargets.map(name).join('·')}`:'';
      return `다음 라운드 ${next}${intent.nextDamage?` ${intent.nextDamage}`:''}${intent.nextAmount?` ${intent.nextAmount}`:''}${target}`;
    }
    const target=intent.target?` · 대상 ${name(intent.target)}`:intent.targets?.length?` · 대상 ${intent.targets.map(name).join('·')}`:'';
    const amount=intent.damage?` ${intent.damage}`:intent.amount?` ${intent.amount}`:'';
    return `${INTENT[intent.type]||'행동'}${amount}${target}`;
  }
  function coach(battle){
    if(!battle)return null;
    const intents=battle.s.intents.filter(i=>battle.actor(i.actor)?.hp>0).map(i=>({enemy:battle.actor(i.actor)?.name,text:intent(i,battle.s.allies)}));
    const threatened=battle.s.allies.filter(a=>a.hp>0).map(a=>({ally:a.name,damage:battle.incomingDamage(a.id),hp:a.hp,shield:a.shield})).filter(a=>a.damage>0).sort((a,b)=>b.damage-a.damage);
    const total=battle.s.allies.filter(a=>a.hp>0).reduce((n,a)=>n+battle.incomingDamage(a.id),0);
    const prompt=threatened.length?`${threatened[0].ally}에게 보호 ${threatened[0].shield}가 있고 예상 피해 ${threatened[0].damage}입니다. 막기·약화·공격으로 행동 끊기 중 손실이 적은 대응을 비교하세요.`:'적의 예고 피해가 없습니다. 지원·준비 행동이 있다면 대상이나 다음 공격을 확인하세요.';
    return {intents,threatened,total,prompt};
  }
  const api={lookup,intent,coach};
  if(typeof module!=='undefined')module.exports=api;
  root.PartyExpeditionBestiary=api;
})(typeof globalThis!=='undefined'?globalThis:this);
