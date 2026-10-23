/**
 * GITHUB ACCOUNT CARD — browser module serialized into the student shell as `GithubAccountCard`.
 * One renderer for a GitHub account ({username, displayName, profileUrl, avatarUrl}): the confirmation
 * step of the username form (StudentGithub) and the member list of the GitHub screen (StudentView) both use it.
 * It returns markup only; it never touches the DOM or the server.
 */
function githubAccountCardBrowser_() {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https:\/\//i.test(String(url)) ? String(url) : '#';
  const AVATAR = 'size-12 shrink-0 rounded-full border border-edge';

  /** Avatar, display name and @username link of one account; with no account, the app's default avatar (initials) and a note. */
  function markup(account, initials) {
    if (!account) return '<div data-github-account class="flex items-center gap-3"><span aria-hidden="true" class="' + AVATAR + ' inline-flex items-center justify-center bg-primary text-sm font-bold text-paper">' + escape(initials) + '</span>' +
      '<p class="m-0 text-sm text-muted">No GitHub username yet</p></div>';
    return '<div data-github-account class="flex items-center gap-3">' +
      (account.avatarUrl ? '<img width="48" height="48" alt="" class="' + AVATAR + '" src="' + escape(safeUrl(account.avatarUrl)) + '">' : '<span class="' + AVATAR + ' bg-soft"></span>') +
      '<div class="min-w-0"><p class="m-0 font-semibold text-ink">' + escape(account.displayName || account.username) + '</p>' +
      '<a class="text-sm text-primary" target="_blank" rel="noopener" href="' + escape(safeUrl(account.profileUrl)) + '">@' + escape(account.username) + '</a></div></div>';
  }
  const MEMBER = 'flex flex-col gap-3 rounded-tile border border-edge bg-paper p-4 text-sm';
  /**
   * One team member's card, the same on the student and guide screens: register number and name, the account, a state line
   * (`state`, markup) and any `after` markup. `attrs` is the view's own data-* hooks as an attribute string.
   */
  function memberCard(options) {
    return '<li' + (options.attrs || '') + ' class="' + MEMBER + '">' +
      '<div class="flex flex-wrap items-baseline gap-x-2"><span data-member-register class="font-semibold text-ink">' + escape(options.register) + (options.isMe ? ' (You)' : '') + '</span>' + (options.name ? '<span class="text-ink-2">' + escape(options.name) + '</span>' : '') + '</div>' +
      markup(options.account, options.initials) +
      '<div data-member-state class="flex flex-wrap items-center gap-1 border-t border-edge pt-3">' + options.state + '</div>' + (options.after || '') + '</li>';
  }
  return {markup, memberCard};
}
