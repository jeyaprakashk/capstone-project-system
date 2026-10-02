const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const GI = 'tests/github-invitation-resend.test.cjs';
module.exports = [
  e(GI, r`match(/<section class="system-status-card(?: card)?" id="studentInvitationResend">[\s\S]*?<\/section>/)`, r`match(/<section(?: class="[^"]*")? id="studentInvitationResend">[\s\S]*?<\/section>/)`),
  e(GI, r`f.host.querySelectorAll('.pagination-buttons button')`, r`f.host.querySelectorAll('#studentInvitationsPaginationButtons button')`),
];
