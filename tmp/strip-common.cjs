// common-styles.js: button appearance now comes only from app-styles framework classes.
const F = 'common-styles.js';
const s = (line, expect, extra = {}) => ({ file: F, line, expect, ...extra });
const drop = (line, expect) => s(line, expect, { drop: true });
module.exports = [
  // Internal publishing
  s(21, '.internal-publishing button {'), drop(22, '.internal-publishing button:hover'),
  drop(23, '.internal-publishing .publishing-primary {'), drop(24, '.internal-publishing .publishing-primary:hover'),
  drop(25, '.internal-publishing .publishing-details {'),
  s(44, '.internal-publishing table button {'),
  s(61, '.internal-publishing table .publishing-icon-action {'), s(63, '.internal-publishing table .publishing-icon-action {'),
  s(87, '.internal-publishing table .publishing-icon-action {'), s(88, '.internal-publishing table .publishing-icon-action {'),
  s(89, '.internal-publishing table button {'),
  // Student workflow controls
  s(818, '.github-form-jump {'), s(842, '.github-username-form button {'),
  // Announcements
  s(914, '.announcement-add-btn, .announcement-refresh-btn {'),
  drop(915, '.announcement-refresh-btn {'), drop(916, '.announcement-refresh-btn:hover'),
  drop(917, '.announcement-add-btn {'), drop(918, '.announcement-add-btn:hover'),
  s(958, '.announcement-audience-filters button,'), drop(959, '.announcement-audience-filters button[aria-pressed="true"]'),
  // Shared timeline
  s(1027, '.timeline-toggle {'), drop(1028, '.timeline-toggle:hover'), s(1029, '.timeline-retry {'),
  // Editorial theme
  drop(1127, ".dashboard-navigation .role-tab-btn|.role-menu-toggle'"), drop(1128, '.role-tab-btn:hover|.role-menu-toggle:hover'),
  drop(1129, ".dashboard-navigation .role-tab-btn.active'"),
  s(1139, "#sharedRubricsToggle|.publishing-toggle'"),
  drop(1143, "#sharedRubricsToggle|.publishing-toggle|#sharedRubricsContent > button'"), drop(1144, '#sharedRubricsToggle:hover:enabled'),
  drop(1179, "button|.dashboard-body-surface button|.announcement-tab-surface button|.btn-outline|.mini|.announcement-add-btn'"),
  drop(1180, "button|.btn-outline|.mini'"), drop(1181, "button:hover:enabled|.btn-outline:hover|.mini:hover'"),
  drop(1182, ".workflow-btn:not(.secondary)|.btn-solid|"), drop(1183, ".workflow-btn:not(.secondary):hover|"),
  drop(1218, ".shared-rubrics > button|.shared-rubrics .rubric-view-button'"), drop(1219, ".shared-rubrics > button:hover|"),
  drop(1220, "${rule('.rubric-assessment',"), drop(1221, ".rubric-assessment:hover:enabled'"),
  drop(1223, ".shared-rubrics .rubric-view-button::before|"),
  drop(1233, ".review-drawer .review-levels button|.review-drawer .review-pi-pills button'"),
  drop(1234, ".review-drawer .review-levels button[aria-pressed=\"true\"]'"),
  drop(1235, ".review-drawer .review-pi-pills button[aria-pressed=\"true\"]|"),
  drop(1238, ".review-drawer .review-pi-pills button|.review-criterion[data-index] .review-feedback-options button|.tracker-tabs .filter-tab'"),
  drop(1239, "--pill-border:var(--border)"), drop(1240, "--pill-border:var(--warning)"),
  drop(1244, ".review-actions [data-submit]|.review-drawer [data-target]|.filter-tab.active:hover:enabled'"),
  drop(1245, ".review-actions [data-submit]:hover:enabled|"),
  drop(1253, "${rule('.mini.approve',"), drop(1254, ".mini.approve:hover:enabled'"), drop(1255, "${rule('.mini.revise',"),
  drop(1256, ".tracker-tabs .deadline-pill'"), drop(1257, '.tracker-tabs .filter-tab[data-filter="ontrack"]'),
  drop(1258, '.tracker-tabs .filter-tab[data-filter="attention"]|'), drop(1259, '.tracker-tabs .filter-tab.active|'),
  drop(1267, ".review-drawer .review-pi-pills button[aria-pressed=\"false\"]:not(:disabled):hover|"),
  drop(1275, ".review-drawer .review-header-students button'"), drop(1276, ".review-header-students button[aria-pressed=\"false\"]"),
  drop(1277, ".review-drawer .review-header-students button[aria-pressed=\"true\"]|"),
  drop(1285, ".dashboard-navigation .role-tab-btn', 'border-radius"), drop(1286, ".dashboard-navigation .role-tab-btn.active', 'box-shadow"),
  s(1300, ".announcement-hub .announcement-audience-filters'"), s(1301, ".announcement-hub .announcement-audience-filters button'"),
  drop(1302, ".announcement-hub .announcement-audience-filters button[aria-pressed=\"true\"]'"),
  drop(1338, ".utility-body .utility-header .announcement-refresh-btn'"), drop(1339, ".utility-header .announcement-refresh-btn:hover:enabled'"),
  s(1356, ".dashboard-app-header .role-tab-btn'"),
];
