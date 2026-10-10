'use strict';
// Read-only authoring gate. Definitions are JSON; no author-supplied code is executed.
const fs=require('fs'),vm=require('vm'),path=require('path'),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','trial-character','ultimate-data','strategy-encounters','actor-ai','engine','campaign','character-engine','ultimate-engine','character-campaign','presentation-data','content-catalog'])vm.runInContext(fs.readFileSync(path.join(__dirname,f+'.js'),'utf8'),ctx);
const catalog=ctx.window.ContentCatalog,report=catalog.audit();
if(process.argv[2]){const file=process.argv[2];try{if(fs.statSync(file).size>131072)throw Error('정의 파일은 128KB 이하여야 합니다.');const pack=JSON.parse(fs.readFileSync(file,'utf8'));report.errors.push(...catalog.validatePack(pack));report.file=file;}catch(e){report.errors.push(e.message);}}
console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
