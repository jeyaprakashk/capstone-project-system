const fs=require('fs');const F='scripts/preview-internal-publishing.cjs';
const style=fs.readFileSync('tmp/preview-style.txt','utf8').trim();
module.exports=[
 {file:F,find:"<style>'+styles.getBaseStyles()+'body{margin:0;background:var(--canvas)}iframe{",replace:"<style>iframe{"},
 {file:F,find:"styles.getBaseStyles()+styles.getCardStyles()+styles.getTableStyles()+styles.getLoadingStyles_()+styles.getDashboardSurfaceStyles_()+styles.getEditorialStyles_()+styles.getLucideStyles_()",replace:"styles.getFunctionalStyles_()"},
 {file:F,find:style,replace:"<style>'+css+'</style>"},
 {file:F,find:".replace('<body><nav','<body data-dashboard-theme=\"editorial\"><nav')",replace:""},
];
