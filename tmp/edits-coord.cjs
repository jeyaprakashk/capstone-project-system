const F='coordinator-dashboard.js';const e=(find,replace)=>({file:F,find,replace});
module.exports=[
 e('.tracker-search #trackerSearch,.tracker-search .reset-btn { height:40px; box-sizing:border-box; margin:0; padding:0 14px; line-height:normal; }',
   '.tracker-search #trackerSearch { height:40px; box-sizing:border-box; margin:0; padding:0 14px; line-height:normal; }\n.tracker-search .reset-btn { height:40px; box-sizing:border-box; margin:0; line-height:normal; }'),
 e(`.team-drawer-close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius:var(--radius-btn);
  background: var(--paper);
  color: var(--primary-hover);
  display:inline-flex;`, `.team-drawer-close {
  width: 36px;
  height: 36px;
  display:inline-flex;`),
 e(`.team-drawer-close:hover {
  background: var(--canvas);
}
`, ``),
 e(`.drawer-repo-link {
  color: var(--primary);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.drawer-repo-link:hover {
  text-decoration: underline;
}
`, `.drawer-repo-link {
  overflow-wrap: anywhere;
}
`),
];
