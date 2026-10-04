// Student dashboard migration: the DTO must carry every fact the server-rendered HTML showed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { expectGolden } = require('./invariants/golden.cjs');
const { studentFixture, SCENARIOS } = require('./student-fixture.cjs');

const BADGE = { done: 'Done', waiting: 'Waiting', locked: 'Locked', active: 'Action needed' };
const MEMBER_TEXT = { missing: 'Submit GitHub Account', joined: 'Repository joined', pending: 'Accept Invitation Email' };

// Facts shown on the page, derived from the DTO the way the view presents them.
function dtoFacts(dto) {
  const g = dto.github, t = dto.title;
  const titleBody = [];
  if (t.locked) {
    titleBody.push('Finish GitHub setup first.');
    if (t.currentTitle) titleBody.push('Current title: ' + t.currentTitle, t.statusText);
  } else {
    titleBody.push(t.statusText);
    if (t.currentTitle) titleBody.push('Current title: ' + t.currentTitle);
    if (t.note) titleBody.push(t.note);
    titleBody.push('Approval due ' + t.due.date + (t.due.overdue ? ' · Overdue' : ''));
  }
  return {
    teamId: dto.teamId,
    roster: dto.roster.map(r => ({ initials: r.initials, name: r.name, regno: r.regno, you: r.isMe })),
    setup: { kind: dto.setup.complete ? 'details' : 'section', badge: dto.setup.complete ? '✓ Complete' : 'Action needed', pending: dto.setup.complete ? [] : dto.setup.pendingSteps },
    steps: [
      { title: 'GitHub setup', badge: BADGE[g.state], body: ['GitHub setup due ' + g.due + ' · ' + g.statusText],
        members: g.members.map(m => ({ status: m.status, regno: m.regno, state: MEMBER_TEXT[m.status], button: m.canConnect })),
        repo: g.repoUrl || 'Not available yet',
        cta: g.connected ? null : { kind: 'form', inputDisabled: !g.captureReady } },
      { title: 'Project title', badge: BADGE[t.state], body: titleBody, members: [], repo: null,
        cta: t.intake ? { kind: 'link', text: t.intake.label, href: t.intake.url } : null }
    ],
    weekly: dto.titleApproved,
    recent: { link: dto.titleApproved, text: dto.titleApproved ? null : 'Weekly logs will appear after project setup.' },
    assessments: { reviews: dto.assessments.reviews.map(r => ({ id: 'studentAssessment-' + r.key, label: r.label })), guide: dto.assessments.guideEvaluationLabel }
  };
}

const text = n => n.textContent.replace(/\s+/g, ' ').trim();
// Extracted from the legacy markup while it existed; the result is frozen in a snapshot.
function legacyFacts(html) {
  const { document } = parseHTML('<div>' + html + '</div>');
  const chips = Array.from(document.querySelectorAll('.avatar')).map(a => {
    const chip = a.parentElement, info = chip.children[1], name = info.children[0];
    return { initials: text(a), name: text(name).replace(/ you$/, ''), regno: text(info.children[1]), you: !!name.querySelector('span') };
  });
  const setupRoot = document.querySelector('.student-project-setup');
  const kind = setupRoot.tagName === 'DETAILS' ? 'details' : 'section';
  const header = kind === 'details' ? setupRoot.querySelector('summary') : setupRoot.querySelector('header');
  const steps = Array.from(setupRoot.querySelectorAll('[data-step-row]')).map(row => {
    const card = row.querySelector('[data-step-card]'), body = card.querySelector('[data-step-body]');
    const form = card.querySelector('form'), link = Array.from(card.children).find(n => n.tagName === 'A');
    const repo = body.querySelector('.github-team-repository');
    return {
      title: text(card.querySelector('h4')), badge: text(card.querySelector('[data-step-header] > span')),
      body: Array.from(body.children).filter(n => n.tagName === 'P').map(text),
      members: Array.from(body.querySelectorAll('li[data-member-status]')).map(li => ({ status: li.getAttribute('data-member-status'), regno: text(li.querySelector('[data-member-register]')), state: text(li.querySelector('[data-member-state]')), button: !!li.querySelector('[data-github-form-jump]') })),
      repo: repo ? (repo.querySelector('a') ? text(repo.querySelector('a')) : text(repo.querySelector('span:last-child'))) : null,
      cta: form ? { kind: 'form', inputDisabled: form.querySelector('#studentGithubProfile').hasAttribute('disabled') } : link ? { kind: 'link', text: text(link), href: link.getAttribute('href') } : null
    };
  });
  return {
    teamId: text(document.querySelector('h2 span')),
    roster: chips,
    setup: { kind, badge: text(header.querySelector('.badge')), pending: Array.from(setupRoot.querySelectorAll('[data-setup-pending] p')).map(text) },
    steps,
    weekly: !!document.querySelector('#studentWeeklyProgress'),
    recent: { link: !!document.querySelector('section[aria-label="Recent logs"] a[href="#studentWeeklyProgress"]'), text: document.querySelector('#studentRecentActivity [data-skeleton]') ? null : text(document.querySelector('#studentRecentActivity')) },
    assessments: { reviews: Array.from(document.querySelectorAll('[data-review-result]')).map(n => ({ id: n.id, label: n.getAttribute('data-assessment-label') })), guide: document.querySelector('#studentGuideEvaluation').getAttribute('data-assessment-label') }
  };
}

function build(name, options) {
  const s = studentFixture(name, options);
  return { s, dto: JSON.parse(s.c.API_student_getDashboard()).data };
}
const normalize = facts => JSON.parse(JSON.stringify(facts));

test('student DTO carries the same facts the server-rendered dashboard showed, in every state', () => {
  const frozen = {};
  for (const name of Object.keys(SCENARIOS)) frozen[name] = normalize(dtoFacts(build(name).dto));
  // Captured from the legacy HTML (buildStudentContent) before it was removed; see git history.
  expectGolden('student-legacy-facts', frozen);
});

test('assessment placeholders follow the configured definitions', () => {
  const { dto } = build('approved', { review: false });
  assert.deepEqual(dto.assessments.reviews, []);
  assert.equal(dto.assessments.guideEvaluationLabel, 'Guide Evaluation');
});

module.exports = { legacyFacts, dtoFacts, build, normalize };
