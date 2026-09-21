const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
exports.install=function(c,count=2){
 const source=fs.readFileSync(path.join(__dirname,'..','common-helpers.js'),'utf8');
 for(const name of ['getInternalReviewsCount_','getInternalReviews_','normalizeText_','projectDay_']) {
  const match=source.match(new RegExp('function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  vm.runInContext(match[0],c);
 }
 vm.runInContext('const PROJECT_DAY_MS_ = 86400000;',c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','milestone-config.js'),'utf8'),c);
 c.setReviews=n=>{c.definitions=Array.from({length:n},(_,i)=>({key:'review'+(i+1),label:'Review '+(i+1),day:20000+i,gradedBy:'Review Committee',weight:10}));};
 c.setReviews(count);c.getMilestones_=()=>c.definitions;
};
