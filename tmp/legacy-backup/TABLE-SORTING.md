# Shared table sorting

Mark sortable header cells with `data-sort-type="text"`, `"number"`, or `"pair"`,
then call `DashboardUI.initializeTableSorting(tableElement)` after rendering.
Headers without this attribute (for example Actions) remain unchanged.

```html
<table id="example">
  <thead><tr><th data-sort-type="text">Team</th><th data-sort-type="number">Count</th></tr></thead>
  <tbody><tr><td data-sort-value="T2">Team T2</td><td>12</td></tr></tbody>
</table>
```

```js
DashboardUI.initializeTableSorting(document.getElementById('example'));
```

The helper adds keyboard-accessible shared buttons, direction indicators and
`aria-sort`. Clicking toggles ascending/descending order. Text uses natural
ordering (T2 before T10); `pair` compares slash-separated numbers by the first
number, then the second. Cells can supply `data-sort-value` to override their
displayed text, especially for icons. Empty, loading and unavailable values stay
last in either direction. Ties retain the supplied row order.

For paginated tables, keep the complete row collection outside the visible DOM.
Pass a persistent `state` object and an `onSort` callback. In that callback reset
the page and render `DashboardUI.sortTableRows(filteredRows, state)` before
slicing the page. Reinitialize headers with the same state after replacing the
table and reapply sorting when asynchronous cell values arrive. The Coordinator
Team Tracker demonstrates this integration; Weekly Activity sorts by logs and
then commit records.
