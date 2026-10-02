const fs=require('fs'),vm=require('vm');
const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},HtmlService:{createHtmlOutputFromFile:n=>({getContent:()=>fs.readFileSync(n+'.html','utf8')})}});
for(const f of ['common-styles.js','common-helpers.js','common-constants.js','guide-dashboard.js','coordinator-dashboard.js','reviewer-dashboard.js','lucide-icons.js','icon-renderer.js','review-evaluation-client.js','dashboard-router.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
for(const n of ['getInternalAssessmentPublishingClientScript_','getDashboardClientScript','getGuideEvaluationClientScript','getGuideWeeklyClientScript_','getReviewEvaluationClientScript_'])c[n]=()=>'';
let h=c.buildDashboardShell('preview@example.test',[{key:'student',label:'My Team',contentId:'studentContent'},{key:'guide',label:'Guide',contentId:'guideContent'}]);
h=h.replace('id="studentContent"','id="studentContent"').replace(/id="sharedRubrics" hidden/,'id="sharedRubrics"');
fs.writeFileSync('tmp/shell.html',h);
