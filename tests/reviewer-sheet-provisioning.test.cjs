const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(options={}) {
 const calls=[]; const properties=new Map();let created=0;
 const RC={COMMITTEE_NUMBER:0,MARKS_SHEET_ID:1,REVIEWER1_EMAIL:2};
 const TS={TEAM_ID:0,COMMITTEE_NUMBER:1};
 const rows=options.rows||[[' C1 ','',' Reviewer@example.com '],['C2','existing','other@example.com']];
 const sheets=new Map(); const files=new Map();
 const rubric=[{pi:'PI1',name:'Test',co:'CO1',maxMarks:100,type:'Team'}];
 const owner={getEmail:()=> 'owner@example.com'};
 function protection(label) { const p={
  setDescription(){return p;},setWarningOnly(v){calls.push(['warning',label,v]);},addEditor(){},
  getEditors(){return [owner,{getEmail:()=> 'unrelated@example.com'}];},
  removeEditors(users){calls.push(['remove',label,...users.map(x=>x.getEmail())]);},
  addEditors(emails){calls.push(['protection-editors',label,...emails]);},canDomainEdit:()=>true,setDomainEdit(v){calls.push(['domain',label,v]);},
  setUnprotectedRanges(ranges){calls.push(['unprotected',label,ranges[0].position]);}
 };return p;}
 function sheet(name) {return {getName:()=>name,setName(value){sheets.delete(name);name=value;sheets.set(name,this);},
  getRange:(...position)=>({position,protect:()=>protection('inputs')}),protect:()=>protection('sheet')};}
 const spreadsheet={getId:()=> 'NewCaseSensitiveID',getUrl:()=> 'https://docs.google.com/spreadsheets/d/NewCaseSensitiveID/edit',getSheets:()=>[...sheets.values()],deleteSheet:s=>sheets.delete(s.getName())};
 const c=createSheetReadContext({checkReviewConfiguration_:()=>({valid:!options.invalidConfig,issues:[{message:"Fix configuration"}]}),Date,console,SHEET_ID:'hub',SHEET_NAMES:{REVIEW_COMMITTEE:'committee',TEAM_STATUS:'teams'},FIELD_DEFINITIONS:{REVIEW_COMMITTEE:{},TEAM_STATUS:{}},
  Session:{getActiveUser:()=>({getEmail:()=>options.denied?'outsider@example.com':'coord@example.com'}),getEffectiveUser:()=>owner},
  getCoordinatorEmail:()=> 'coord@example.com',getConfig:()=> 'pd@example.com',
  normalizeText_:v=>String(v??'').trim().toLowerCase(),normalizeEmail:v=>String(v??'').trim().toLowerCase(),emailsMatch:(a,b)=>String(a).trim().toLowerCase()===String(b).trim().toLowerCase(),textEquals_:(a,b)=>String(a).trim().toLowerCase()===String(b).trim().toLowerCase(),
  getColumnMap:name=>name==='committee'?RC:TS,getSheetRows:name=>name==='committee'?rows:[['T1','c1']],
  getSheet:()=>({getLastColumn:()=>3,getRange:(r,col,n,w)=>({getValues:()=>rows.slice(r-2,r-2+n).map(row=>row.slice(col-1,col-1+w)),getValue:()=>rows[r-2][col-1],setValue:value=>{rows[r-2][col-1]=value;calls.push(['write-id',value]);}})}),
  getStudentsFromTeamStatusRow_:()=>[{regNo:'A',name:'Student'}],getReviewDefinitions_:()=>Array.from({length:options.reviewCount || 2},(_,i)=>({key:'review'+(i+1),number:i+1,rubric})),
  getNamedSheet_:(ss,name)=>sheets.get(name)||null,
  seedCommitteeReviewTab:(ss,committee,key)=>{const name=c.committeeReviewTabName_(committee,{key});sheets.set(name,sheet(name));calls.push(['seed',key]);},
  LockService:{getScriptLock:()=>({tryLock:()=>!options.busy,releaseLock:()=>calls.push(['unlock'])})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,v)=>properties.set(key,v),deleteProperty:key=>properties.delete(key)})},
  SpreadsheetApp:{create:()=>{created++;calls.push(['create']);sheets.set('Sheet1',sheet('Sheet1'));return spreadsheet;},openById:()=>spreadsheet,flush(){}},
  DriveApp:{getFileById:()=>({setShareableByEditors:v=>calls.push(['reshare',v])})},
  Drive:{Files:{
    get:(id,settings)=>{assert.equal(settings.supportsAllDrives,true);return id==='hub'?{parents:options.noParent?[]:['project-folder']}:(options.sharedDrive?{driveId:'shared-drive'}:{});},
    create:(metadata,media,settings)=>{
      assert.equal(metadata.parents[0],'project-folder');assert.equal(metadata.mimeType,'application/vnd.google-apps.spreadsheet');
      assert.equal(settings.supportsAllDrives,true);created++;calls.push(['create']);sheets.set('Sheet1',sheet('Sheet1'));
      return {id:'NewCaseSensitiveID'};
    }
  },Permissions:{create:(permission,id,settings)=>{
    assert.equal(permission.type,'user');assert.equal(permission.role,'writer');
    assert.equal(id,'NewCaseSensitiveID');assert.equal(settings.sendNotificationEmail,false);
    assert.equal(settings.supportsAllDrives,true);
    calls.push(['share',permission.emailAddress]);if(options.failShare)throw Error('sharing blocked');
    return {id:'permission-id'};
  }}}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','milestone-config.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','reviewer-sheet-provisioning.js'),'utf8'),c);
 return {c,calls,rows,properties,options,created:()=>created,sheets};
}

test('creates only missing committee files, protects before sharing and writes exact ID',()=>{
 const f=setup();const result=f.c.createNextReviewerSpreadsheet([]);
 assert.equal(result.ok,true);assert.equal(result.key,'c1');assert.equal(f.created(),1);
 assert.equal(f.rows[0][1],'NewCaseSensitiveID');assert.equal(f.rows[1][1],'existing');
 assert.equal(f.properties.size,0);assert.equal(f.sheets.size,2);
 assert(f.sheets.has('Review1Evaluations'));assert(f.sheets.has('Review2Evaluations'));
 const share=f.calls.findIndex(x=>x[0]==='share');const protect=f.calls.findIndex(x=>x[0]==='unprotected');assert(protect<share);
 assert.deepEqual(f.calls[share],['share','reviewer@example.com']);
 assert(f.calls.some(x=>x[0]==='reshare'&&x[1]===false));
 assert.equal(JSON.stringify(f.calls.find(x=>x[0]==='unprotected')[2]),JSON.stringify([2,7,1,2]));
 assert(!f.calls.some(x=>x[0]==='protection-editors'&&x[1]==='sheet'));
 assert(f.calls.some(x=>x[0]==='protection-editors'&&x[1]==='inputs'&&x[2]==='reviewer@example.com'));
 assert.equal(f.c.createNextReviewerSpreadsheet([]).done,true);assert.equal(f.created(),1);
});

test('sharing failure resumes the same prepared file without rewriting student rows',()=>{
 const f=setup({failShare:true});assert.equal(f.c.createNextReviewerSpreadsheet([]).ok,false);
 assert.equal(f.rows[0][1],'');assert.equal(f.created(),1);assert.equal(f.properties.size,1);
 f.options.failShare=false;assert.equal(f.c.createNextReviewerSpreadsheet([]).ok,true);
 assert.equal(f.created(),1);assert.equal(f.calls.filter(x=>x[0]==='seed').length,2);
});

test('Shared Drive creation uses the project folder and skips My Drive resharing flag',()=>{
 const f=setup({sharedDrive:true});assert.equal(f.c.createNextReviewerSpreadsheet([]).ok,true);
 assert.equal(f.created(),1);assert(!f.calls.some(x=>x[0]==='reshare'));
});

test('provisioning creates all configured review tabs',()=>{
 const f=setup({reviewCount:3});assert.equal(f.c.createNextReviewerSpreadsheet([]).ok,true);
 assert.equal(f.sheets.size,3);assert(f.sheets.has('Committee C1 - review3'));
 assert.equal(f.calls.filter(call=>call[0]==='unprotected').length,3);
});

test('server rejects invalid configuration before creating files even if dashboard was ready',()=>{
 const f=setup({invalidConfig:true});
 assert.throws(()=>f.c.createNextReviewerSpreadsheet([]),/Review configuration needs attention/);
 assert.equal(f.created(),0);assert.equal(f.properties.size,0);
 assert(f.calls.some(call=>call[0]==='unlock'));
});

test('missing project folder fails without creating a file in My Drive',()=>{
 const f=setup({noParent:true});assert.match(f.c.createNextReviewerSpreadsheet([]).error,/folder/);
 assert.equal(f.created(),0);
});

test('authorization, lock and duplicate committee checks prevent creation',()=>{
 const denied=setup({denied:true});assert.throws(()=>denied.c.createNextReviewerSpreadsheet([]),/Coordinator access/);assert.equal(denied.created(),0);
 const busy=setup({busy:true});assert.throws(()=>busy.c.createNextReviewerSpreadsheet([]),/Another setup/);assert.equal(busy.created(),0);
 const duplicate=setup({rows:[['C1','','a@example.com'],[' c1 ','','b@example.com']]});
 assert.match(duplicate.c.createNextReviewerSpreadsheet([]).error,/Duplicate/);assert.equal(duplicate.created(),0);
});

test('attempted failures are skipped so the browser loop terminates',()=>{
 const f=setup({rows:[['C1','','']]});const result=f.c.createNextReviewerSpreadsheet([]);
 assert.equal(result.ok,false);assert.equal(f.created(),0);
 assert.equal(f.c.createNextReviewerSpreadsheet([result.key]).done,true);
});

test('new row formulas reference their own rows and support columns beyond Z',()=>{
 const c=createSheetReadContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','marks-tracker.js'),'utf8'),c);
 const rubric=Array.from({length:21},(_,i)=>({pi:'PI'+(i+1),name:'Test',co:'CO1',maxMarks:5,type:'Team'}));
 const a=c.buildStudentMarkRow(1,'T1','C1',{regNo:'A',name:'Alice'},rubric);
 const b=c.buildStudentMarkRow(2,'T1','C1',{regNo:'B',name:'Bob'},rubric);
 assert(a[5].includes('H2'));assert(a[5].includes('AB2'));assert(b[5].includes('H3'));assert(!b[5].includes('H2'));
 assert.equal(a[6],'');assert.equal(a.length,28);assert.equal(c.buildHeaderRow(rubric)[6],'Comments');
});
