'use strict';
const assert=require('node:assert/strict');
const {Battle,ROLES}=require('./party-expedition-core.js');
const {roles,cue,allyPreview}=require('./party-expedition-guide.js');
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
const party=['navigator','diver','pilot','lightkeeper'];
function make(kinds=['guard','strike','burst','focus','expose'],roster=party){return new Battle({party:roster,deck:kinds.map((kind,i)=>({id:'c'+i,kind})),enemies:[{id:'e',hp:100,pattern:'hunter'}]});}
check('여섯 문양의 목적·예시·두 효과를 모두 제공',()=>{for(const r of ROLES){assert.ok(roles[r.id].purpose&&roles[r.id].example&&roles[r.id].passive&&roles[r.id].execution);}});
check('항해사 선행 조건과 실제 +6을 구분',()=>{const b=make();assert.equal(cue(b,'navigator','c1').active,false);b.play('c0','lightkeeper','lightkeeper');assert.equal(cue(b,'navigator','c1').text,'첫 타격 +6');});
check('도선사의 준비 지출과 파티 합산 +10을 구분',()=>{const b=make();assert.match(cue(b,'pilot','c2').text,/0\/2/);b.play('c0','lightkeeper','lightkeeper');b.play('c1','lightkeeper','e');assert.equal(cue(b,'pilot','c2').text,'첫 타격 +10');});
check('0비용·기본·에너지 부족은 발동 표시하지 않음',()=>{const b=make();assert.equal(cue(b,'diver','c3').active,false);assert.equal(cue(b,'navigator','basic').active,false);b.s.energy=0;assert.match(cue(b,'pilot','c2').text,/에너지 2 필요/);});
check('소진 카드 인양 금지와 손패 예약을 구분',()=>{const b=make(['jab','strike','guard','burst','focus'],['navigator','pilot','salvager','lightkeeper']);assert.match(cue(b,'salvager','c0').text,/유료/);assert.equal(cue(b,'salvager','c1').text,'다음 손패에 이 카드 확보');});
check('안내 조회는 손패·난수·효과 상태를 바꾸지 않음',()=>{const b=make(),before=b.snapshot();for(const a of b.s.allies){cue(b,a.id);for(const c of b.s.zones.hand)cue(b,a.id,c);}assert.deepEqual(b.snapshot(),before);});
check('쓰러진 동료의 효과는 준비 표시하지 않음',()=>{const b=make();b.actor('diver').hp=0;assert.equal(cue(b,'diver','c1').text,'쓰러짐');});
check('전체 방어와 대상 합계를 구분해 보호를 중복 합산하지 않음',()=>{const b=make(['bastion','strike','guard','focus','expose']);const preview=allyPreview(b,'c0','lightkeeper','navigator');assert.equal(preview.shared,'전원 보호 +6');assert.equal(preview.local,'합계 보호 +12 · 반격 6');});
check('보호 여부에 따른 추가 드로우는 대상 미리보기에서 구분',()=>{const b=make(['beacon','strike','guard','focus','expose']);b.s.zones.hand=['c0','c1','c2','c3'];b.s.zones.draw=['c4'];b.actor('navigator').shield=3;assert.equal(allyPreview(b,'c0','lightkeeper','navigator').local,'보호 +4 · 손패 +1');assert.equal(allyPreview(b,'c0','lightkeeper','pilot').local,'보호 +4');});
console.log(`${checks} guide checks passed`);
