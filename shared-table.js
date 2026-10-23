/**
 * SHARED TABLE — browser module serialized into every dashboard page as `SharedTable`.
 * The one definition of how a data table looks: the scroll region, the header, the rows and the cells, all
 * standard Tailwind utilities with the theme tokens (no custom CSS, no inline styles, no per-element handlers).
 * Views pass data and their own `data-*` hooks; they hold no table classes of their own. Each function returns
 * escaped markup, so a view composes a table as table({label, head, body}) with head(...) and tbody(row(...)).
 * Every table of teams starts with the same three columns, Team, Students and Guide (teamHead / teamCells).
 * Attributes are an object: a string is escaped, `true` is a bare attribute, `false`/null/undefined is skipped.
 */
function sharedTableBrowser_() {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

  const WRAP = 'max-w-full overflow-x-auto overscroll-x-contain rounded-card border border-edge bg-paper';
  const TABLE = 'w-full border-collapse text-left text-sm text-ink';
  const HEAD = 'bg-soft';
  const TH = 'px-3 py-2 text-left text-xs font-semibold text-muted';
  const TD = 'px-3 py-2 align-top text-sm';
  const ROW_HEAD = 'px-3 py-2 text-left align-top text-sm font-semibold';
  const ROW = 'border-b border-edge last:border-b-0 hover:bg-canvas';
  const BADGE = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const TONES = {success:'bg-success-tint text-success ring-success/20', warning:'bg-warning-tint text-warning ring-warning/20', danger:'bg-danger-tint text-danger ring-danger/20', info:'bg-info-tint text-info ring-info/20', neutral:'bg-soft text-ink-2 ring-control/20'};
  const STUDENTS = TD + ' min-w-72';
  const NOTE = 'block text-xs text-muted';
  const EMPTY = 'px-3 py-6 text-sm text-muted';

  const attributes = attrs => Object.keys(attrs || {}).filter(name => attrs[name] !== false && attrs[name] != null)
    .map(name => attrs[name] === true ? ' ' + name : ' ' + name + '="' + escape(attrs[name]) + '"').join('');

  /** A column header cell; `html` is already-escaped markup (a label, or a label inside a sort button). */
  const th = (html, attrs) => '<th scope="col" class="' + TH + '"' + attributes(attrs) + '>' + html + '</th>';
  /** A header row from th() cells, for headers that hold more than a label (a sort button). */
  const headRow = cells => '<tr>' + cells.join('') + '</tr>';
  /** A header row from plain labels: columns are strings or {label, attrs}. */
  const head = columns => headRow(columns.map(column => typeof column === 'string' ? th(escape(column)) : th(escape(column.label), column.attrs)));
  const td = (html, attrs) => '<td class="' + TD + '"' + attributes(attrs) + '>' + html + '</td>';
  /** A cell spanning the row that holds its own scrolling content (a nested table): it never widens the table around it. */
  const spanCell = (html, columns) => '<td class="' + TD + ' max-w-0" colspan="' + escape(columns) + '">' + html + '</td>';
  /** The first cell of a row when it names the row (a team, a student). */
  const rowHeader = (html, attrs) => '<th scope="row" class="' + ROW_HEAD + '"' + attributes(attrs) + '>' + html + '</th>';
  /** `cells` is an array of td()/rowHeader() markup. */
  const row = (cells, attrs) => '<tr class="' + ROW + '"' + attributes(attrs) + '>' + cells.join('') + '</tr>';
  const tbody = (rows, attrs) => '<tbody' + attributes(attrs) + '>' + rows + '</tbody>';
  /** A status badge in one of the standard tones: success, warning, danger, info or neutral (the default). `html` is escaped markup. */
  const badge = (tone, html) => '<span class="' + BADGE + (TONES[tone] || TONES.neutral) + '">' + html + '</span>';
  /** A line under a value inside a cell. */
  const note = html => '<span class="' + NOTE + '">' + html + '</span>';
  /** The first three columns of every team table: the team ID, its students as "Name (register)" and the guide. */
  const TEAM_COLUMNS = ['Team', 'Students', 'Guide'];
  const studentList = (students, itemAttrs) => students.length
    ? '<ul class="m-0 list-none p-0">' + students.map(student => '<li><span' + attributes(itemAttrs) + '>' + escape((student.name || 'Name unavailable') + ' (' + student.regNo + ')') + '</span></li>').join('') + '</ul>'
    : '—';
  /** `team`: {teamId, students:[{name, regNo}], guide}. `options.after` is markup placed beside the team ID (a spinner). */
  const teamCells = (team, options) => [
    td('<strong>' + escape(team.teamId) + '</strong>' + ((options && options.after) || '')),
    '<td class="' + STUDENTS + '"' + attributes(options && options.studentsCellAttrs) + '>' + studentList(team.students || [], options && options.studentAttrs) + '</td>',
    td(escape(team.guide || '—'))
  ];
  const emptyRow = (columns, html) => '<tr><td class="' + EMPTY + '" colspan="' + escape(columns) + '">' + html + '</td></tr>';

  /**
   * The scroll region and table. `label` names both (caption for assistive technology, region name for the
   * keyboard-focusable scroller); `head` is head()/th() markup or '' when a script fills it later; `body` is one or
   * more tbody() elements.
   */
  function table(options) {
    const label = escape(options.label);
    return '<div class="' + WRAP + '" data-tooltip-boundary role="region" aria-label="' + label + ', scroll horizontally for more columns" tabindex="0"' + attributes(options.wrapAttrs) + '>' +
      '<table class="' + TABLE + '"' + attributes(options.tableAttrs) + '><caption class="sr-only">' + label + '</caption><thead class="' + HEAD + '">' + (options.head || '') + '</thead>' + options.body + '</table></div>';
  }

  return {table, head, headRow, badge, TEAM_COLUMNS, studentList, teamCells, th, td, spanCell, rowHeader, row, tbody, note, emptyRow, attributes};
}
