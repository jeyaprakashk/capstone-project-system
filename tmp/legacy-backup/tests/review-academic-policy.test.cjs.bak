const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function context(){const c=vm.createContext({});vm.runInContext(fs.readFileSync('review-academic-policy.js','utf8'),c);return c;}
const config={academicPolicyVersion:'review-attendance-v1',weight:.25,criteria:[{pi:'T',type:'Team',maxMarks:60},{pi:'I',type:'Individual',maxMarks:40}]};
const team={T:{marks:48,level:3,remark:''}},normal={I:{marks:32,level:3,remark:''}};
const cases=[['Present',{type:'NORMAL'},48,32],... [true,false].map(approved=>['Absent '+approved,{type:'REVIEW_DAY_ABSENCE',approved},48,approved?null:0]),... [true,false].flatMap(verifiedContribution=>[true,false].flatMap(approved=>[true,false].map(attended=>['Long '+[verifiedContribution,approved,attended],{type:'PROLONGED',verifiedContribution,approved,attended},verifiedContribution&&approved?48:0,attended?32:approved?null:0])))];
for(const [name,facts,t,i] of cases)test(name+': deterministic components, completion, actions and immutable input',()=>{
 const c=context(),student={register:'s1',scores:facts.type==='NORMAL'||facts.attended?normal:{},assessment:{facts}},before=JSON.stringify(student);
 const r=c.reviewPolicyCalculate_(config,team,student);assert.equal(r.assessment.teamMark,t);assert.equal(r.assessment.individualMark,i);assert.equal(r.total,i===null?null:t+i);assert.equal(r.assessment.completed,i!==null);assert.equal(r.assessment.status,i===null?'MAKEUP_PENDING':'COMPLETED');assert.equal(r.assessment.nextActions.makeup,i===null);assert.equal(r.assessment.teamState,'RESOLVED');assert.equal(JSON.stringify(student),before);
 assert.equal(r.weighted,r.total===null?null:Math.round(r.total*.25*100)/100);
});
test('attended evidence is required regardless of contribution/approval',()=>{const c=context();for(const approved of [true,false])for(const verifiedContribution of [true,false]){const r=c.reviewPolicyCalculate_(config,team,{scores:{},assessment:{facts:{type:'PROLONGED',approved,verifiedContribution,attended:true}}});assert.equal(r.assessment.individualState,'UNASSESSED');assert.equal(r.assessment.completed,false);assert.equal(r.assessment.nextActions.makeup,false);}});
test('makeup applicability changes without converting evidence or recreating provenance',()=>{
 const c=context(),makeup={scores:normal,eventId:'original',actor:'reviewer',at:'original-time'},student={scores:{},assessment:{facts:{type:'PROLONGED',approved:true,verifiedContribution:false,attended:false},makeup}};
 const original=JSON.stringify(student);let r=c.reviewPolicyCalculate_(config,team,student);assert.equal(r.total,32);assert.equal(r.assessment.individualSource,'makeup');
 student.assessment.facts.attended=true;r=c.reviewPolicyCalculate_(config,team,student);assert.equal(r.total,null);assert.equal(r.assessment.individualState,'UNASSESSED');
 student.assessment.facts.attended=false;student.assessment.facts.approved=false;r=c.reviewPolicyCalculate_(config,team,student);assert.equal(r.total,0);assert.equal(r.assessment.individualSource,'policy');
 student.assessment.facts.approved=true;r=c.reviewPolicyCalculate_(config,team,student);assert.equal(r.total,32);assert.equal(r.assessment.makeup.eventId,'original');assert.equal(JSON.stringify(student),original);
});
test('normal evidence never silently becomes makeup; unsupported policy rejected',()=>{const c=context();const s={scores:normal,assessment:{facts:{type:'REVIEW_DAY_ABSENCE',approved:true}}};assert.equal(c.reviewPolicyCalculate_(config,team,s).total,null);assert.throws(()=>c.reviewPolicyCalculate_({...config,academicPolicyVersion:'unknown'},team,s),/policy/);});
test('required facts are explicit; optional administrative evidence does not affect outcomes',()=>{const c=context();assert.throws(()=>c.reviewPolicyFacts_({type:'PROLONGED',approved:true,attended:true}),/Contribution/);assert.deepEqual(JSON.parse(JSON.stringify(c.reviewPolicyFacts_({type:'REVIEW_DAY_ABSENCE',approved:true}))),{type:'REVIEW_DAY_ABSENCE',approved:true,attended:false});});


test('approval is optional only for prolonged absence with no contribution and review attendance',()=>{
 const c=context();
 for(const approved of [undefined,null,true,false]){
  const facts={type:'PROLONGED',verifiedContribution:false,attended:true,approved};
  const result=c.reviewPolicyCalculate_(config,team,{scores:normal,assessment:{facts}});
  assert.equal(result.assessment.teamMark,0);assert.equal(result.assessment.individualMark,32);assert.equal(result.assessment.completed,true);assert.equal(result.total,32);
 }
 for(const facts of [{type:'PROLONGED',verifiedContribution:true,attended:true},{type:'PROLONGED',verifiedContribution:false,attended:false},{type:'REVIEW_DAY_ABSENCE'}])assert.throws(()=>c.reviewPolicyFacts_(facts),/Absence Approved/);
});

test('supporting absence evidence is validated and irrelevant evidence is discarded',()=>{
 const c=context(),facts={type:'REVIEW_DAY_ABSENCE',approved:true,supportingEvidence:['APPROVAL_DOCUMENT','OTHER'],otherEvidenceText:' Verified '},before=JSON.stringify(facts);
 assert.equal(c.reviewPolicyFacts_(facts).otherEvidenceText,'Verified');assert.equal(JSON.stringify(facts),before);
 for(const supportingEvidence of [['UNKNOWN'],['OTHER','OTHER'],'OTHER'])assert.throws(()=>c.reviewPolicyFacts_({...facts,supportingEvidence}),/Invalid supporting absence evidence/);
 assert.throws(()=>c.reviewPolicyFacts_({...facts,otherEvidenceText:'x'.repeat(2001)}),/2000/);
 for(const irrelevant of [{...facts,approved:false},{...facts,type:'NORMAL'},{...facts,type:'PROLONGED',verifiedContribution:false,attended:true}])assert.equal(c.reviewPolicyFacts_(irrelevant).supportingEvidence,undefined);
});
