const fs=require('fs');let lines=fs.readFileSync('tmp/functional.css','utf8').split('\n');
const drop=[/\[hidden\] \{ display:none( !important)?; \}$/, /\[hidden\] \{ display: none; \}$/,
 /\.timeline-stop \{ position:relative; \}/, /timeline-stop:has\(~ \.timeline-stop:not\(\[hidden\]\)\)::after/, /^\s*\.stage-dot/, /\.timeline-timing \{/, /\.timeline-full \.(timeline-timing|stage-dot)/,
 /\.timeline-track:not\(\.timeline-full\) \.timeline-stop::after/, /data-timeline-mobile="true"\]:has/,
 /\.coordinator-stats-grid \.stat-card \{ position:relative/, /\.lucide-icon\.stat-icon/,
 /\.review-drawer \.team-drawer-header \{ position:relative/, /\.review-drawer \.team-drawer-close \{/, /\.review-actions \{ z-index/,
 /student-team-overview/, /\.shared-rubrics \.rubric-view-button \{ position:relative/, /#sharedRubricsToggle\[hidden\]/, /\.collapsible\[open\] summary::before/];
lines=lines.filter(l=>!drop.some(re=>re.test(l)));
lines=lines.map(l=>l.replace(/body\[data-dashboard-theme="editorial"\] /g,'').replace('#sharedRubricsToggle[aria-expanded="true"] .lucide-icon, ',''));
let text=lines.join('\n').replace(/@[^{\n]+\{\n\}\n/g,'');
fs.writeFileSync('tmp/functional-final.css',text);console.log(text.split('\n').length,'lines');
