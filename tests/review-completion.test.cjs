const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(tabs={}) {
  const counts={opens:0,reads:0};
  const TS={TEAM_ID:0,COMMITTEE_NUMBER:1,S1_REGNO:2,S1_EMAIL:3,S2_REGNO:4,S2_EMAIL:5};
  const roster=[['T1','1','A','a@example.com','B','b@example.com'],['T2','1','C','c@example.com'],['T3','2','D','d@example.com']];
  const c=createSheetReadContext({getNamedSheet_:(ss,name)=>ss.getSheetByName(name),getRubricStructure_:()=>Object.fromEntries(['review1','review2'].map(key=>[key,Array.from({length:7},(_,i)=>({pi:'PI'+(i+1),name:'Criterion',co:'CO1',maxMarks:i===6?10:15,type:'Team'}))])),Logger:{log(){}},SHEET_NAMES:{TEAM_STATUS:'teams',REVIEW_COMMITTEE:'committees'},FIELD_DEFINITIONS:{TEAM_STATUS:{},REVIEW_COMMITTEE:{}},
    getColumnMap:name=>name==='teams'?TS:{COMMITTEE_NUMBER:0,MARKS_SHEET_ID:1},
    getSheetRows:name=>name==='teams'?roster:[['1','shared'],['2','shared']],
    getStudentTeamId:()=> 'T1',emailsMatch:(a,b)=>a===b,
    SpreadsheetApp:{openById:()=>{counts.opens++;return {getSheetByName:name=>{
      const rows=tabs[name];if(!rows)return null;
      if(rows instanceof Error)throw rows;
      return {getName:()=>name,getLastRow:()=>rows.length+1,getLastColumn:()=>14,getRange:(r,col,n,width)=>{
        assert.equal(r,1);assert.equal(col,1);assert.equal(width,14);return {getValues:()=>{
        counts.reads++;
        return [[1,2,3,4,5,6,'Comments',...Array(7).fill('Criterion')],...rows];
      }};}};
    }}}}
  });
require('./milestone-fixture.cjs').install(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','marks-tracker.js'),'utf8'),c);
  return {c,counts,roster};
}
const row=(team,reg,levels,total=0)=>[1,team,reg,'Student',1,total,'',...levels];
const zero=()=>Array(7).fill(0);

test('third configured review participates in completion and student marks',()=>{
 const f=setup({'Committee 1 - review3':[row('T1','A',zero()),row('T1','B',zero())]});
 f.c.setReviews(3);
 const structure=f.c.getRubricStructure_();structure.review3=structure.review1;
 f.c.getRubricStructure_=()=>structure;
 assert.equal(f.c.getReviewDefinitions_().length,3);
 assert.equal(f.c.getTeamReviewCompletionStatus_('T1').review3.completed,true);
 assert.equal(f.c.getStudentAllReviewMarks('a@example.com').review3.completed,true);
 assert.equal(f.c.getStudentAllReviewMarks('a@example.com').review4,undefined);
});

test('rubric validation accepts real zeroes but rejects blanks, errors and invalid levels',()=>{
  const {c}=setup();
  for(const v of [0,'0',5,' 5 ',1,2,3,4])assert(c.isReviewMarkEntered_(v),String(v));
  for(const v of ['', ' ',null,undefined,true,false,NaN,Infinity,-1,6,2.5,'pending','#N/A','0x0',[],{}])assert(!c.isReviewMarkEntered_(v),String(v));
  const rubric=Array(7).fill({});
  assert(!c.isReviewRowComplete_(row('T1','A',Array(7).fill(''),0),rubric));
  assert(c.isReviewRowComplete_(row('T1','A',zero(),0),rubric));
  assert(!c.isReviewRowComplete_(row('T1','A',[0,0,0,0,0,0,''],99),rubric));
  assert(!c.isReviewRowComplete_(row('T1','A',zero()),[]));
});

test('bulk and single-team results agree; each spreadsheet opens once and tab reads once',()=>{
  const tabs={'Committee 1 - review1':[row('T1','A',zero()),row('T1','B',zero()),row('T2','C',Array(7).fill(''))],
    'Committee 1 - review2':[row('T1','A',zero()),row('T1','B',[0,0,0,0,0,0,''])],
    'Committee 2 - review1':[row('T3','D',zero())]};
  const bulk=setup(tabs);const all=bulk.c.getAllReviewCompletionStatus_();
  assert.equal(all.t1.review1.completed,true);assert.equal(all.t1.review2.completed,false);
  assert.equal(all.t2.review1.completed,false);assert.equal(all.t3.review1.completed,true);
  assert.equal(bulk.counts.opens,1);assert.equal(bulk.counts.reads,3);
  const single=setup(tabs);const team=single.c.getTeamReviewCompletionStatus_(' T1 ');
  assert.equal(JSON.stringify(team),JSON.stringify(all.t1));
  assert.equal(single.counts.reads,2);assert.equal(single.counts.opens,1);
  assert.equal(single.c.getTeamReviewCompletionStatus_('unknown'),null);
});

test('duplicate and foreign student rows cannot falsely complete a team',()=>{
  const {c}=setup({'Committee 1 - review1':[row('T1','A',zero()),row('T1','A',zero()),row('T1','B',zero()),row('T1','stranger',zero())]});
  const result=c.getTeamReviewCompletionStatus_('T1').review1;
  assert.equal(result.markedStudents,1);assert.equal(result.completed,false);
});

test('a failed review does not prevent the next review from loading',()=>{
  const {c}=setup({'Committee 1 - review1':Error('unavailable'),'Committee 1 - review2':[row('T1','A',zero()),row('T1','B',zero())]});
  const result=c.getTeamReviewCompletionStatus_('T1');
  assert.equal(result.review1.completed,false);assert.equal(result.review2.completed,true);
  assert.equal(result.review1.available,false);assert.equal(result.review2.available,true);
});

test('missing tabs are unavailable while a readable empty tab is incomplete',()=>{
  const {c}=setup({'Committee 1 - review2':[]});
  const result=c.getTeamReviewCompletionStatus_('T1');
  assert.equal(result.review1.available,false);
  assert.equal(result.review2.available,true);
  assert.equal(result.review2.completed,false);
});

test('student totals above 5 and all-zero completed assessments are preserved',()=>{
  const {c}=setup({'Committee 1 - review1':[row('T1','A',Array(7).fill(4),80)],'Committee 1 - review2':[row('T1','A',zero(),0)]});
  const result=c.getStudentAllReviewMarks('a@example.com');
  assert.equal(result.review1.totalMarks,80);assert.equal(result.review1.completed,true);
  assert.equal(result.review2.totalMarks,0);assert.equal(result.review2.completed,true);
});

test('student formula zero with blank criteria remains incomplete',()=>{
  const {c}=setup({'Committee 1 - review1':[row('T1','A',Array(7).fill(''),0)]});
  const result=c.getStudentAllReviewMarks('a@example.com');
  assert.equal(result.review1.totalMarks,0);assert.equal(result.review1.completed,false);
});

test('marks joins normalize team and register identifiers across sheets',()=>{
  const {c}=setup({'Committee 1 - review1':[row(' t1 ',' a ',zero()),row('T1',' b ',zero())]});
  const result=c.getTeamReviewCompletionStatus_(' t1 ');
  assert.equal(result.teamId,'T1');assert.equal(result.review1.completed,true);
});

test('review timings preserve results and count opens and review reads',()=>{
 const f=setup({'Committee 1 - review1':[row('T1','A',zero()),row('T1','B',zero())]});
 const expected=f.c.getAllReviewCompletionStatus_();
 const timings=[];
 const actual=f.c.getAllReviewCompletionStatus_(timings);
 assert.equal(JSON.stringify(actual),JSON.stringify(expected));
 assert.equal(timings.find(t=>t.phase==='review_detail_open').calls,1);
 assert.equal(timings.find(t=>t.phase==='review_detail_read').calls,4);
 assert.equal(timings.find(t=>t.phase==='review_read_lookup').calls,4);
 assert.equal(timings.find(t=>t.phase==='review_read_values').calls,1);
 for(const phase of ['review_read_row_count','review_read_column_count']) assert.equal(timings.find(t=>t.phase===phase).calls,1);
 assert(timings.every(t=>t.durationMs>=0&&t.success));
});

test('full-width review reader preserves validation and retains extra columns',()=>{
 const {c}=setup();const review=c.getReviewDefinitions_()[0];
 let reads=0;
 const read=values=>c.readReviewRows_({getSheetByName:()=>({getName:()=> 'Review',
   getLastRow:()=>values.length,
   getLastColumn:()=>values[0].length,
   getDataRange:()=>{throw Error("Unexpected unbounded read");},
   getRange:(r,col,n,width)=>({getValues:()=>{reads++;assert.equal(width,values[0].length);return values.slice(0,n).map(row=>row.slice(0,width));}})
 })},'1',review);
 const header=[1,2,3,4,5,6,'Comments',...Array(7).fill('Criterion')];
 assert.equal(read([['']]).length,0);
 assert.equal(read([header]).length,0);
 assert.throws(()=>read([header.slice(0,13),Array(13).fill('')]),/Missing rubric columns/);
 const badHeader=header.slice();badHeader[6]='Wrong';
 assert.throws(()=>read([badHeader,row('T1','A',zero())]),/Expected Comments/);
 const result=read([[...header,'Extra'],[...row('T1','A',zero()),'Ignored']]);
 assert.equal(result[0].length,15);assert.equal(result[0][14],'Ignored');assert(c.isReviewRowComplete_(result[0],review.rubric));
 assert.equal(reads,2);
});

test('custom milestone IDs drive completion and student marks without numeric review aliases',()=>{
 const f=setup({'Committee 1 - design_check':[row('T1','A',zero()),row('T1','B',zero())]});
 f.c.definitions=[{key:'design_check',label:'Design Check',day:20000,gradedBy:'Review Committee',weight:25}];
 const rubric=f.c.getRubricStructure_().review1;f.c.getRubricStructure_=()=>({design_check:rubric});
 assert.equal(f.c.getTeamReviewCompletionStatus_('T1').design_check.completed,true);
 const marks=f.c.getStudentAllReviewMarks('a@example.com');assert.equal(marks.design_check.completed,true);assert.equal(marks.review1,undefined);
 const legacy=setup({'Committee 1 - Review 1':[row('T1','A',zero()),row('T1','B',zero())]});
 assert.equal(legacy.c.getTeamReviewCompletionStatus_('T1').review1.available,false);
});
