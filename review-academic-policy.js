/** Production Review policy. Pure functions are also serialized for browser previews. */
const REVIEW_ACADEMIC_POLICY_VERSION_ = 'review-attendance-v1';
function reviewPolicyFacts_(value) {
  const f=value || {type:'UNSELECTED'};
  if(f.type==='UNSELECTED')return {type:'UNSELECTED',attended:null};
  if(f.type==='NORMAL')return {type:'NORMAL',attended:true};
  if(!['REVIEW_DAY_ABSENCE','PROLONGED'].includes(f.type))throw new Error('Invalid attendance classification.');
  if(typeof f.approved!=='boolean')throw new Error('Absence Approved must be Yes or No.');
  if(f.type==='REVIEW_DAY_ABSENCE')return {type:f.type,approved:f.approved,attended:false};
  if(typeof f.verifiedContribution!=='boolean')throw new Error('Contribution Established must be Yes or No.');
  if(typeof f.attended!=='boolean')throw new Error('Attended the Review must be Yes or No.');
  return {type:f.type,approved:f.approved,verifiedContribution:f.verifiedContribution,attended:f.attended};
}
function reviewPolicyScoresComplete_(criteria,scores) {
  const bands=[0,40,60,75,85,95,100];
  return criteria.every(c=>{
    const s=(scores||{})[c.pi];
    return s && typeof s.marks==='number' && Number.isFinite(s.marks) && Number.isInteger(s.marks*2) && Number.isInteger(s.level) && s.level>=0 && s.level<=5 &&
      s.marks>=c.maxMarks*bands[s.level]/100 && (s.level===5?s.marks<=c.maxMarks:s.marks<c.maxMarks*bands[s.level+1]/100) &&
      String(s.remark||'').length<=2000 && (s.level>=2 || !!String(s.remark||'').trim());
  });
}
function reviewPolicyCalculate_(config,teamScores,student,frozenTeam) {
  if(config.academicPolicyVersion!=='review-attendance-v1')throw new Error('Unsupported Review academic policy version.');
  const previous=student.assessment||{},facts=reviewPolicyFacts_(previous.facts);
  const team=config.criteria.filter(c=>c.type==='Team'),individual=config.criteria.filter(c=>c.type==='Individual');
  const sum=(criteria,scores)=>reviewPolicyScoresComplete_(criteria,scores)?Math.round(criteria.reduce((n,c)=>n+scores[c.pi].marks,0)*100)/100:null;
  const teamApplicable=facts.type!=='PROLONGED'||facts.approved&&facts.verifiedContribution;
  const normal=facts.type==='NORMAL'||facts.type==='PROLONGED'&&facts.attended;
  const makeupApplicable=facts.type!=='UNSELECTED'&&!facts.attended&&facts.approved;
  const makeup=previous.makeup;
  const validMakeup=makeup && makeup.eventId && reviewPolicyScoresComplete_(individual,makeup.scores);
  const teamMark=frozenTeam?frozenTeam.teamMark:facts.type==='UNSELECTED'?null:teamApplicable?sum(team,teamScores):0;
  const individualMark=facts.type==='UNSELECTED'?null:normal?sum(individual,student.scores):makeupApplicable?(validMakeup?sum(individual,makeup.scores):null):0;
  const teamSource=frozenTeam?frozenTeam.teamSource:teamApplicable?'common':'policy';
  const individualSource=normal?'assessment':makeupApplicable?(validMakeup?'makeup':'pending'):'policy';
  const teamState=frozenTeam?frozenTeam.teamState:teamMark===null?'UNASSESSED':'RESOLVED';
  const individualState=individualMark!==null?'RESOLVED':makeupApplicable?'PENDING':'UNASSESSED';
  const completed=teamState==='RESOLVED'&&individualState==='RESOLVED';
  const total=completed?Math.round((teamMark+individualMark)*100)/100:null;
  const maximum=config.criteria.reduce((n,c)=>n+c.maxMarks,0);
  const status=completed?'COMPLETED':teamState==='RESOLVED'&&individualState==='PENDING'?'MAKEUP_PENDING':'INCOMPLETE';
  const effectiveScores={};
  config.criteria.forEach(c=>{
    if(frozenTeam && c.type==='Team'){effectiveScores[c.pi]={...frozenTeam.effectiveScores[c.pi]};return;}
    const isTeam=c.type==='Team',source=isTeam?teamSource:individualSource,state=isTeam?teamState:individualState;
    const evidence=(isTeam?teamScores:source==='makeup'?makeup.scores:student.scores)||{};
    effectiveScores[c.pi]={marks:state!=='RESOLVED'?null:source==='policy'?0:evidence[c.pi].marks,maximum:c.maxMarks,co:c.co,state,source};
  });
  return {...student,total,weighted:total===null?null:Math.round(total/maximum*config.weight*10000)/100,
    assessment:{facts,...(makeup?{makeup}:{}),...(previous.makeupDraft?{makeupDraft:previous.makeupDraft}:{}),
      ...(previous.events?{events:previous.events}:{}),teamMark,individualMark,teamState,individualState,teamSource,individualSource,
      effectiveScores,completed,status,policyVersion:config.academicPolicyVersion,nextActions:{makeup:individualState==='PENDING'}}};
}
