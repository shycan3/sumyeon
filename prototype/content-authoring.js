'use strict';
(()=>{
 const D=window.GameData,K=window.CharacterData,copy=x=>JSON.parse(JSON.stringify(x)),presentations={},art={};
 const text=(s,n=180)=>typeof s==='string'&&s.trim().length>0&&s.length<=n,asset=s=>typeof s==='string'&&/^assets\/[a-z0-9_-]+\.svg$/.test(s),number=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
 function validate(r){const errors=[],bad=(ok,s)=>{if(!ok)errors.push(s);},c=r?.character;
  if(!r||typeof r!=='object'||Array.isArray(r))return ['제작 정의가 객체여야 합니다.'];
  bad(r.schemaVersion===2&&['authoring-only','live'].includes(r.status),'지원하는 제작 버전·격리 상태가 필요합니다.');bad(Object.keys(r).every(k=>['schemaVersion','status','character','cards','skills','presentation','partySlot','startingReplacements','tradeoff','contentVersion'].includes(k)),'알 수 없는 제작 필드');
  bad(r.contentVersion===1,'제작 콘텐츠 버전은 1입니다.');bad(text(r.tradeoff),'강점과 대가가 필요합니다.');
  if(!c||!r.cards||!r.presentation)return errors.concat('캐릭터·카드·연출 정의가 필요합니다.');
  bad(/^[a-z][a-z0-9_]{1,39}$/.test(c.id||'')&&!K.character(c.id),'중복·잘못된 캐릭터 ID');bad([2,3].includes(c.role)&&r.partySlot===c.role,'현재 사수·지원가 교체만 지원합니다.');
  bad(Object.keys(c).every(k=>['id','playable','role','name','tag','base','reward','stances','basicProfile','line','desc'].includes(k)),'새 AI·패시브는 별도 검증이 필요합니다.');bad(c.playable===true&&text(c.name,40)&&text(c.tag)&&text(c.line)&&text(c.desc),'캐릭터 식별·대사·설명');
  bad(Array.isArray(c.stances)&&c.stances.length===2&&c.stances.every(s=>text(s,30)),'두 태세가 필요합니다.');bad(c.basicProfile&&Object.keys(c.basicProfile).length===4&&number(c.basicProfile.range,1,500)&&number(c.basicProfile.speed,1,150)&&number(c.basicProfile.damage,.1,20)&&number(c.basicProfile.period,.1,10),'기본 행동 수치');
  const keys=Object.keys(r.cards),base=c.base,reward=c.reward;if(!Array.isArray(base)||!Array.isArray(reward))return errors.concat('기초/보상 키트는 배열이어야 합니다.');bad(keys.length>=2&&keys.length<=8,'소수 키트 범위');bad(Array.isArray(base)&&base.length>0&&Array.isArray(reward)&&reward.length>0&&new Set([...(base||[]),...(reward||[])]).size===keys.length&&keys.every(k=>base?.includes(k)||reward?.includes(k)),'완전한 기초/보상 키트');
  for(const [key,d]of Object.entries(r.cards)){bad(/^[a-z][a-z0-9_]{1,49}$/.test(key)&&!D.cards[key]&&!D.hostile[key],key+': 중복·잘못된 카드 ID');if(!d||typeof d!=='object'){errors.push(key+': 카드 객체 필요');continue;}
   bad(Object.keys(d).every(k=>['name','role','kind','power','time','prep','duration','limit','source','traits','desc','spatial','radius','buildVersion','buildHint'].includes(k)),key+': 미지원 효과 필드');bad(d.role===c.role&&['base','reward'].includes(d.source)&&(d.source==='base'?base:reward)?.includes(key),key+': 소유·획득 경로');
   bad((c.role===2?['attack']:['heal','healAll','ward']).includes(d.kind),key+': 미지원 공유 효과');bad(number(d.power,1,100)&&number(d.time,2,12)&&number(d.prep,0,2)&&Number.isInteger(d.limit)&&d.limit>=1&&d.limit<=3,key+': 카드 수치');bad(d.kind==='ward'?number(d.duration,.2,10):d.duration===undefined,key+': 보호막 지속');
   bad(d.buildHint===undefined||d.buildVersion===1&&text(d.buildHint,80),key+': 빌드 장점·대가 설명');bad(d.buildVersion===undefined||d.buildVersion===1&&d.source==='reward',key+': 보상 빌드 버전');bad(d.spatial===undefined?d.radius===undefined:d.kind==='healAll'&&d.spatial==='circleHeal'&&number(d.radius,60,200),key+': 주변 회복 범위');
   bad(text(d.name,60)&&text(d.desc),key+': 이름·설명');bad(Array.isArray(d.traits)&&d.traits.length>0&&new Set(d.traits).size===d.traits.length&&d.traits.every(t=>window.CardTraits.traits[t]),key+': 모든 카드에 유효 특성 필요');
   const p=r.presentation[key];bad(p&&Object.keys(p).every(k=>['tier','style','pose','color','line','portrait','art'].includes(k))&&['basic','accent','signature'].includes(p.tier)&&['heal','ward','slash','signature'].includes(p.style)&&p.pose==='default'&&/^#[0-9a-f]{6}$/i.test(p.color)&&text(p.line)&&asset(p.art)&&(p.tier==='signature'?asset(p.portrait):p.portrait===undefined),key+': 연출·로컬 그림 정의');
  }
  bad(Object.keys(r.presentation).every(k=>keys.includes(k)),'키트 밖 연출 정의');
  for(const [key,s]of Object.entries(r.skills||{})){
   const combo=c.role===2&&s?.type==='comboStrike'&&s.target==='enemy'&&Object.keys(s).every(k=>['type','target','offsets','recovery','reason'].includes(k))&&Array.isArray(s.offsets)&&s.offsets.length>=1&&s.offsets.length<=3&&s.offsets.every((n,i)=>number(n,.02,2)&&(!i||n>s.offsets[i-1]))&&number(s.recovery,0,2)&&s.recovery>=s.offsets.at(-1);
   const cover=c.role===3&&r.cards[key]?.kind==='ward'&&s?.type==='coverWard'&&s.target==='otherAlly'&&Object.keys(s).every(k=>['type','target','counterPower','reason'].includes(k))&&number(s.counterPower,1,15);
   bad(keys.includes(key)&&s&&(combo||cover)&&text(s.reason),'미지원 공유 기술');
  }
  bad(Array.isArray(r.startingReplacements)&&r.startingReplacements.length>0&&r.startingReplacements.length<=3&&new Set(r.startingReplacements.map(x=>x?.from)).size===r.startingReplacements.length&&r.startingReplacements.every(x=>x&&Object.keys(x).length===2&&K.characters[c.role]?.base.includes(x.from)&&base?.includes(x.to)),'출발 키트 변환 정의');
  // Reject insufficient copies before any registry is mutated.
  for(const preset of [K.starter,...K.startingDecks.map(p=>p.template)]){const counts={...preset};for(const x of r.startingReplacements||[])if(x?.from&&x?.to&&counts[x.from]){counts[x.to]=(counts[x.to]||0)+counts[x.from];delete counts[x.from];}bad(Object.keys(counts).filter(k=>base?.includes(k)).every(k=>counts[k]<=r.cards[k]?.limit),'출발 덱 사본 상한');bad(!Object.keys(counts).some(k=>K.characters[c.role]?.base.includes(k)),'이전 캐릭터 기초 카드가 남습니다.');}
  return errors;
 }
 function register(recipe){const errors=validate(recipe);if(errors.length)throw Error(errors.join('\n'));const r=copy(recipe);for(const [key,d]of Object.entries(r.cards))D.cards[key]=copy(d);for(const [key,s]of Object.entries(r.skills||{}))K.registerSkill(key,s);const c=K.registerCharacter(r.character);for(const key of Object.keys(r.cards)){K.setCasterRule(key,{characterId:c.id});presentations[key]={...r.presentation[key],title:D.cards[key].name};art[key]=r.presentation[key].art;}return Object.freeze(r);}
 function template(t,r){const out={...t};for(const x of r.startingReplacements)if(out[x.from]){out[x.to]=(out[x.to]||0)+out[x.from];delete out[x.from];}return out;}
 window.ContentAuthoring={validate,register,template,presentations,art};
})();
