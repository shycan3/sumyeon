'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),recipe=JSON.parse(fs.readFileSync(__dirname+'/content-support-template.json','utf8'));
for(const change of [r=>r.cards.noa_patch.traits=[],r=>r.character.actorPolicy='new-ai',r=>r.character.id='ria',r=>r.cards.noa_patch.kind='unknown',r=>r.cards.noa_guard.duration=-1,r=>r.presentation.noa_guard.art='https://bad.example/a.svg',r=>r.startingReplacements[0].to='missing',r=>r.cards.noa_patch.limit=1,r=>r.character.base=null]){
 const ctx=vm.createContext({window:{}});for(const f of ['data','character-data','trial-character','content-authoring'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);const before=JSON.stringify(ctx.window.GameData.cards),r=JSON.parse(JSON.stringify(recipe));change(r);assert.throws(()=>ctx.window.ContentAuthoring.register(r));assert.equal(JSON.stringify(ctx.window.GameData.cards),before,'invalid recipe must not partially register');assert(!ctx.window.CharacterData.character('noa'));
}
console.log('PASS atomic rejection: missing trait/AI/duplicate/unsupported effect/duration/remote art/mapping/copy cap/malformed kit');
