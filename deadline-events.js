/** Add actionable event definitions here; rendering and filtering remain generic. */
const DEADLINE_PILL_LEAD_DAYS_ = 5;

function getTeamDeadlineEvents_(row, columns, repoUrl, logs, reviews, schedule, clock, logSummary, githubSetup) {
  if (!schedule || !clock) return [];
  githubSetup = githubSetup || getTeamGithubSetup_(row[columns.TEAM_ID], { row, columns, repoUrl });
  const events = [
    {key:'formation', label:'Team Formation Pending', due:schedule.formation,
      complete:[1,2,3,4].some(number => row[columns['S' + number + '_EMAIL']])},
    {key:'repository', label:githubSetup.repositoryOnly ? 'Repository URL Pending' : 'GitHub Usernames Pending', due:schedule.formation,
      complete:githubSetup.repositoryOnly ? githubSetup.ready : githubSetup.usernamesComplete || githubSetup.verificationUnavailable},
    {key:'title', label:'Title Pending', due:schedule.title, complete:textEquals_(row[columns.REVIEWER_DECISION], 'Approved')}
  ];
  for (const {key,label,day} of schedule.reviews) {
    if (!reviews || !reviews[key] || reviews[key].available === false) continue;
    events.push({key, label:label + ' Pending', due:day, complete:!!(reviews && reviews[key] && reviews[key].completed)});
  }
  const weeks = logSummary || getTeamLogWeekSummary_(row, columns, logs, schedule, clock);
  events.push({key:'weekly-logs', label:weeks.missing ? 'Weekly Logs Overdue' : 'Weekly Logs Pending',
    due:weeks.firstMissingDue !== null ? weeks.firstMissingDue : clock.today < schedule.week1 ? Math.min(schedule.week1 + 6, schedule.end) : clock.end,
    complete:!weeks.missing && (clock.today > schedule.end || weeks.currentLogged)});
  return events;
}

function buildDeadlinePills_(teamEvents, today) {
  if (!Number.isSafeInteger(today)) return [];
  const grouped = new Map();
  teamEvents.forEach(events => events.forEach(event => {
    if (!Number.isSafeInteger(event.due) || today < event.due - DEADLINE_PILL_LEAD_DAYS_) return;
    if (!grouped.has(event.key)) grouped.set(event.key, {...event, count:0});
    const pill = grouped.get(event.key);
    if (!event.complete) {
      pill.count++;
      if (event.due < pill.due) { pill.due = event.due; pill.label = event.label; }
    }
  }));
  return [...grouped.values()].filter(event => event.count > 0).sort((a,b) => a.due - b.due).map(event => ({
    key:event.key, label:event.label, count:event.count, due:event.due,
    overdue:today > event.due && event.count > 0
  }));
}
