(function(root){
  'use strict';
  const roles={
    navigator:{purpose:'동료를 바꿔 이어가기',example:'보호를 동료에게 맡긴 뒤, 항해사로 공격하면 선회가 더해집니다.',passive:'실행자를 바꾼 유료 공격의 첫 타격 +2',execution:'다른 생존 동료의 유료 카드 뒤: 첫 타격 +4 또는 가장 다친 동료 보호 4'},
    diver:{purpose:'틈을 만들고 에너지 회수',example:'잠수자가 적에게 노출을 남기면, 동료의 후속 공격으로 추가 피해와 에너지를 얻습니다.',passive:'라운드 첫 노출 소비 때 에너지 +1',execution:'첫 유료 적 대상 카드 뒤 노출 4'},
    pilot:{purpose:'준비 뒤 큰 카드 실행',example:'먼저 에너지 2를 카드에 쓰고 도선사에게 공격을 맡기면 도선이 더해집니다.',passive:'유료 카드 뒤 첫 기본 비용 2 이상 카드: 피해 또는 대상 보호 +3',execution:'앞선 카드 지출 2 이상: 첫 타격 +5 또는 자신 보호 5'},
    sounder:{purpose:'필요한 손패 찾기',example:'적의 의도를 보고 6장 중 1장을 버립니다. 측심사에게 맡긴 첫 유료 카드 뒤에는 새 카드를 뽑습니다.',passive:'라운드 시작 6장을 보고 1장 버리기',execution:'첫 유료 카드 뒤 카드 1장 뽑기'},
    salvager:{purpose:'좋은 카드를 다음 손패로',example:'다음에도 쓸 카드를 인양사에게 맡기세요. 다음 라운드에 다른 동료에게 인계하면 비용이 줄어듭니다.',passive:'인양해 돌아온 사본을 다른 동료가 쓰면 비용 −1, 최소 1',execution:'첫 유료 비소진 카드를 다음 손패에 보관'},
    lightkeeper:{purpose:'보호를 다음 라운드까지',example:'등대지기가 실행하면 자신에게 보호를 얻습니다. 적 공격 뒤 가장 많이 남은 보호 중 최대 4를 유지합니다.',passive:'한 동료의 남은 보호 최대 4 이월',execution:'첫 유료 카드 뒤 자신 보호 4'}
  };
  function cue(b,id,card,choice){
    const a=b.actor(id),r=roles[id],d=b.definition(card,choice);
    if(!a||a.hp<=0)return {text:'쓰러짐',active:false};
    if(!d){
      const idle={navigator:'다른 동료 뒤에 맡기기',diver:'적에게 노출을 남기기',pilot:`준비 지출 ${Math.min(2,b.s.paidEnergy)}/2`,sounder:'카드 실행 뒤 1장 뽑기',salvager:'다음에도 쓸 카드 맡기기',lightkeeper:'첫 실행으로 자신 보호 +4'};
      return {text:a.ready?idle[id]:'실행 특성 사용 완료',active:false};
    }
    const info=b.effectInfo(card,id,choice);
    if(info.actualCost>b.s.energy)return {text:`에너지 ${info.actualCost} 필요`,active:false};
    if(card==='basic'||info.actualCost===0)return {text:'고유 효과는 유료 카드에서',active:false};
    const parts=[];
    if(info.damageBonus)parts.push(`첫 타격 +${info.damageBonus}`);
    if(info.shieldBonus)parts.push(`대상 보호 +${info.shieldBonus}`);
    if(info.actualCost<d.cost)parts.push(`인계 비용 ${info.actualCost}`);
    if(info.eligible){
      if(id==='navigator'&&!d.damage&&!d.areaDamage)parts.push('다친 동료 보호 +4');
      if(id==='pilot'&&!d.damage&&!d.areaDamage)parts.push('자신 보호 +5');
      if(id==='diver')parts.push('다음 공격을 위한 노출 4');
      if(id==='sounder')parts.push('추가 드로우 1');
      if(id==='salvager')parts.push('다음 손패에 이 카드 확보');
      if(id==='lightkeeper')parts.push('자신 보호 +4');
    }
    const why={navigator:!b.s.memory?'다른 동료의 유료 카드 먼저':b.s.memory.actor===id?'다른 동료에게 먼저 맡기기':'앞선 동료가 생존해야 발동',diver:'적 대상 카드를 맡기기',pilot:`앞선 카드 지출 ${b.s.paidEnergy}/2 필요`,salvager:d.power?'지속 카드는 인양할 수 없음':'소진 카드는 인양할 수 없음'};
    if(parts.length){if(a.ready&&!info.eligible&&why[id])parts.push(why[id]);return {text:parts.join(' · '),active:info.eligible||info.damageBonus>0||info.shieldBonus>0||info.actualCost<d.cost};}
    if(!a.ready)return {text:'실행 특성 사용 완료',active:false};
    return {text:why[id]||r.purpose,active:false};
  }
  function linkCue(b,card){
    const d=b.definition(card);if(!d?.link)return null;
    const active=(d.exposureDraw||d.exposedDamage)&&b.s.enemies.some(a=>a.hp>0&&a.exposure>0)||d.weakDamage&&b.s.enemies.some(a=>a.hp>0&&a.weak>0)||(d.shieldedDraw||d.spendShield||d.shieldDamage||d.protectedShield||d.protectedHeal)&&b.s.allies.some(a=>a.hp>0&&a.shield>0)||d.reserveDiscard&&b.s.zones.discard.length>0||d.retrieveFamily&&b.s.zones.discard.some(id=>b.definition(id).family===d.retrieveFamily);
    return {text:d.link,active:!!active};
  }
  function allyPreview(b,card,actor,target,choice){
    const after=b.preview(card,actor,target,choice),before=b.actor(target),a=after.allies.find(x=>x.id===target),local=[],shared=[];
    if(a.hp>before.hp)local.push(`회복 +${a.hp-before.hp}`);
    if(a.shield>before.shield)local.push(`${b.definition(card,choice).allShield?'합계 ':''}보호 +${a.shield-before.shield}`);
    if(a.reaction>before.reaction)local.push(`반격 ${a.reaction}`);
    const drawn=after.zones.hand.length-b.s.zones.hand.length+1;if(drawn>0)local.push(`손패 +${drawn}`);
    const d=b.definition(card,choice);if(d.allShield)shared.push(`전원 보호 +${d.allShield*(d.cost==='X'?b.s.energy:1)}`);
    if(d.power)shared.push('지속 설치 · 동일 효과는 큰 값만 적용');
    if(d.nextEnergy)shared.push(`다음 라운드 에너지 +${d.nextEnergy}`);
    if(d.nextShield)shared.push(`다음 라운드 ${b.actor(actor).name} 보호 +${d.nextShield}`);
    const reserved=after.zones.reserve.filter(id=>!b.s.zones.reserve.includes(id));
    if(reserved.length)shared.push('다음 손패: '+reserved.map(id=>b.definition(id).name).join(', '));
    return {local:local.join(' · ')||'공통 효과 적용',shared:shared.join(' · ')};
  }
  const api={roles,cue,linkCue,allyPreview};
  if(typeof module!=='undefined')module.exports=api;
  root.PartyExpeditionGuide=api;
})(typeof globalThis!=='undefined'?globalThis:this);
