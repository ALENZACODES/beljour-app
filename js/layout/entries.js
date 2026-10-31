/** One entry for the layout v1 pages: the page says which screen it is in <body data-page>.
 * Nothing here fetches, downloads a model or reads a photo on load.
 * Author: John Khan.
 */
import { mountClientShell } from "./client-shell.js";
import { mountHome } from "./home-view.js";
import { mountHomeFilters } from "./home-filters.js";
import { mountHomeGroups } from "./home-groups.js";
import { mountHomeToday } from "./home-today.js";
import { mountJudgeEntry } from "./judge-entry.js";
import { mountTimingEntry } from "../diagnostics/timing-entry.js";
import { mountAccessibilityEntry } from "../diagnostics/accessibility-entry.js";
import { mountInstallEntry } from "../mobile/install-entry.js";
import { mountTrust } from "./trust-view.js";
const page = typeof document !== "undefined" ? document.body.dataset.page : undefined;
if (page === "home") {
    mountHome();
    mountHomeToday();
    mountHomeGroups();
    mountHomeFilters();
}
else if (page === "trust")
    mountTrust();
// Workstream D r21d: shared client bar for Home and Trust.
if (page === "home" || page === "trust")
    mountClientShell(document, window, { page });
// BFCache restores the document without rerunning its module entry.
window.addEventListener("pageshow", (event) => {
    if (event.persisted && (page === "home" || page === "trust")) {
        mountClientShell(document, window, { page });
    }
});
// Workstream D r22d: opt-in judge walkthrough on Home; no provider call or photo upload.
if (page === "home") {
    mountJudgeEntry(document, window);
    mountTimingEntry(document, window);
    mountAccessibilityEntry(document, window);
    mountInstallEntry(document, window);
}
