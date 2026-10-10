'use strict';
const fs=require('node:fs'),path=require('node:path');
const {CARDS,cardDefinition}=require('./party-expedition-core.js');
const {families,rarities}=require('./party-expedition-catalog.js');
const escape=s=>String(s??'').replaceAll('|','／').replaceAll('\n',' ');
const lines=['# 《수면》 공용 카드 100종 목록','','2026-10-10 · 게임이 사용하는 실제 일반·강화 정의에서 생성. 기본 공격과 강화판은 별도 종류로 세지 않는다. 모든 계열은 모든 캐릭터가 사용할 수 있다.','','[공통 규칙과 검증 기준](100종_카드_공통규칙_설계.md)','',''];
for(const [family,label]of Object.entries(families)){
 const entries=Object.entries(CARDS).filter(([id,d])=>id!=='basic'&&d.family===family).map(([id])=>[id,cardDefinition(id,'draft-1')]);
 lines.push(`## ${label} · ${entries.length}종`,'','| 카드 | 비용 | 희귀도 | 일반 효과 | 강화 효과 | 사용 목적·연결 |','|---|---:|---|---|---|---|');
 for(const [id,d]of entries)lines.push(`| ${escape(d.name)} | ${d.cost} | ${rarities[d.rarity]} | ${escape(d.text)} | ${escape(d.upgrade.text)}${d.upgrade.cost!==undefined?` (비용 ${d.upgrade.cost})`:''} | ${escape(d.role)}${d.link?' · '+escape(d.link):''} |`);
 lines.push('');
}
fs.writeFileSync(path.join(__dirname,'../docs/공용_카드_100종_목록.md'),lines.join('\n'));
console.log('100종 실제 일반·강화·계열·역할 목록 생성');
