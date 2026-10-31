/** Optional local accessibility rehearsal on Home. No uploads or analytics. */
import { buildAccessibilityEvidence, serializeAccessibilityEvidence, accessibilityEvidenceText } from "./accessibility-report.js";
import { AccessibilityReview, REVIEW_TASKS } from "../mobile/a11y-review.js";
import { AccessibilityPageReview, REVIEW_PAGES } from "../mobile/accessibility-pages.js";
import { FocusObservationSession } from "../mobile/a11y-focus.js";
import { KeyboardRehearsal, keyboardEvidenceText } from "../mobile/keyboard-rehearsal.js";
import { inspectResponsiveLayout } from "../mobile/responsive-audit.js";
import { inspectAccessibility } from "../mobile/a11y-scan.js";
function element(doc, tag, text = "") {
    const node = doc.createElement(tag);
    node.textContent = text;
    return node;
}
export function mountAccessibilityPage(doc, host, browser) {
    let disposed = false;
    let last = null;
    const review = new AccessibilityReview();
    const pages = new AccessibilityPageReview();
    let lastResponsive = null;
    const focus = new FocusObservationSession(doc);
    const keyboard = new KeyboardRehearsal(doc, {
        getStyle: (element) => {
            try {
                return browser.getComputedStyle(element);
            }
            catch {
                return null;
            }
        },
        referenceExists: (id) => Boolean(doc.getElementById(id)),
    });
    const body = element(doc, "section");
    body.className = "lg-accessibility-screen";
    body.setAttribute("aria-label", "Accessibility and keyboard review");
    const heading = element(doc, "h2", "Accessibility self-check");
    heading.id = "lg-accessibility-title";
    heading.tabIndex = -1;
    const description = element(doc, "p", "Review this browser's layout and try keyboard, phone and screen-reader access. Findings are hints, not certification.");
    const safety = element(doc, "p", "Runs here on your device. No photo, input value, keyboard text or diagnostic result leaves this page.");
    const auditButton = element(doc, "button", "Scan visible Home controls");
    auditButton.type = "button";
    auditButton.id = "lg-accessibility-scan";
    const focusButton = element(doc, "button", "Start focus observation");
    focusButton.type = "button";
    focusButton.id = "lg-accessibility-focus";
    const keyboardButton = element(doc, "button", "Start keyboard rehearsal");
    keyboardButton.type = "button";
    keyboardButton.id = "lg-accessibility-keyboard";
    const viewportButton = element(doc, "button", "Measure this viewport");
    viewportButton.type = "button";
    viewportButton.id = "lg-accessibility-viewport";
    const deviceStatus = element(doc, "p", "Keyboard and viewport measurements have not been requested.");
    deviceStatus.id = "lg-accessibility-device-status";
    const status = element(doc, "p", "No scan has been run and all manual tasks are unreviewed.");
    status.id = "lg-accessibility-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const findings = element(doc, "section");
    findings.id = "lg-accessibility-findings";
    const checklist = element(doc, "fieldset");
    checklist.className = "lg-accessibility-checklist";
    checklist.append(element(doc, "legend", "Review on a real device"));
    const tasks = new Map();
    for (const task of REVIEW_TASKS) {
        const row = element(doc, "div");
        row.className = "lg-accessibility-task";
        const label = element(doc, "label", task.title);
        const select = element(doc, "select");
        select.id = `lg-accessibility-${task.id}`;
        label.htmlFor = select.id;
        for (const [value, text] of [
            ["not-reviewed", "Not reviewed"],
            ["confirmed", "Checked manually"],
            ["issue-found", "Issue observed"],
            ["not-applicable", "Not applicable on this device"],
        ]) {
            const option = element(doc, "option", text);
            option.value = value;
            select.append(option);
        }
        select.value = "not-reviewed";
        select.addEventListener("change", () => {
            if (disposed)
                return;
            try {
                review.answer(task.id, select.value);
                updateSummary();
            }
            catch {
                select.value = "not-reviewed";
                status.textContent = "Invalid review choice was rejected.";
            }
        });
        tasks.set(task.id, select);
        row.append(label, element(doc, "p", task.instruction), select);
        checklist.append(row);
    }
    const pageChecklist = element(doc, "fieldset");
    pageChecklist.className = "lg-accessibility-checklist";
    pageChecklist.append(element(doc, "legend", "Check each public client page"));
    for (const page of REVIEW_PAGES) {
        const row = element(doc, "div");
        row.className = "lg-accessibility-task";
        const link = element(doc, "a", `Open ${page.title} for manual review`);
        link.href = page.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const description = element(doc, "p", page.objective);
        const label = element(doc, "label", `Review outcome for ${page.title}`);
        const select = element(doc, "select");
        select.id = `lg-accessibility-page-${page.id}`;
        label.htmlFor = select.id;
        for (const [value, text] of [
            ["not-reviewed", "Not reviewed"],
            ["checked-manually", "Reviewed on device"],
            ["issue-observed", "Issue observed"],
            ["unable-to-check", "Could not review"],
        ]) {
            const option = element(doc, "option", text);
            option.value = value;
            select.append(option);
        }
        select.value = "not-reviewed";
        select.addEventListener("change", () => {
            if (disposed)
                return;
            try {
                pages.record(page.id, select.value);
                updateSummary();
            }
            catch {
                select.value = "not-reviewed";
                status.textContent = "Unknown page-review choice was rejected.";
            }
        });
        row.append(link, description, label, select);
        pageChecklist.append(row);
    }
    const download = element(doc, "button", "Save photo-free review notes");
    download.type = "button";
    download.id = "lg-accessibility-save";
    const returnLink = element(doc, "a", "Return to Home");
    returnLink.href = "#home";
    const actions = element(doc, "div");
    actions.className = "lg-accessibility-actions";
    actions.append(auditButton, focusButton, keyboardButton, viewportButton, download, returnLink);
    body.append(heading, description, safety, actions, status, deviceStatus, findings, checklist, pageChecklist);
    host.replaceChildren(body);
    heading.focus({ preventScroll: true });
    function updateSummary() {
        const report = buildAccessibilityEvidence(last, review.snapshot, focus.snapshot, pages.snapshot, keyboard.snapshot, lastResponsive);
        status.textContent = accessibilityEvidenceText(report);
    }
    function presentFindings(report) {
        const title = element(doc, "h3", "On-screen hints");
        const info = element(doc, "p", `${report.inspected} elements inspected. ${report.findings.length} hints recorded.`);
        const caveat = element(doc, "p", report.disclaimer);
        const list = element(doc, "ol");
        for (const finding of report.findings) {
            const node = element(doc, "li", `${finding.rule}: ${finding.message} (${finding.element}).`);
            node.dataset.findingSeverity = finding.severity;
            list.append(node);
        }
        if (!report.findings.length)
            list.append(element(doc, "li", "No hints from this static scan. Manual review still required."));
        findings.replaceChildren(title, info, caveat, list);
    }
    auditButton.addEventListener("click", () => {
        if (disposed)
            return;
        try {
            const main = doc.getElementById("lg-main") ?? doc.body;
            const styles = (node) => {
                try {
                    return browser.getComputedStyle(node);
                }
                catch {
                    return null;
                }
            };
            last = inspectAccessibility(main, {
                style: styles,
                viewportWidth: browser.innerWidth,
                contentWidth: Math.max(doc.documentElement?.scrollWidth ?? 0, doc.body.scrollWidth),
            });
            presentFindings(last);
            updateSummary();
        }
        catch {
            status.textContent = "The DOM scan could not complete. Manual checks remain available.";
        }
    });
    focusButton.addEventListener("click", () => {
        if (disposed)
            return;
        if (focus.snapshot.started) {
            focus.stop();
            focusButton.textContent = "Start focus observation";
            updateSummary();
            return;
        }
        focus.start();
        focusButton.textContent = "Stop focus observation";
        status.textContent = "Focus observation is on. Tab through controls; only element kinds and counts are recorded.";
    });
    keyboardButton.addEventListener("click", () => {
        if (disposed)
            return;
        if (keyboard.snapshot.active) {
            keyboard.stop();
            keyboardButton.textContent = "Start keyboard rehearsal";
            deviceStatus.textContent = keyboardEvidenceText(keyboard.snapshot);
            return;
        }
        keyboard.start();
        keyboardButton.textContent = "Stop keyboard rehearsal";
        deviceStatus.textContent = "Keyboard rehearsal is on. Only Tab counts and accessibility hints are recorded.";
    });
    viewportButton.addEventListener("click", () => {
        if (disposed)
            return;
        try {
            const area = doc.getElementById("lg-main") ?? doc.body;
            const measured = inspectResponsiveLayout(area, {
                viewportWidth: browser.innerWidth,
                contentWidth: Math.max(doc.documentElement?.scrollWidth ?? 0, doc.body.scrollWidth ?? 0),
                style: (element) => { try {
                    return browser.getComputedStyle(element);
                }
                catch {
                    return null;
                } },
            });
            lastResponsive = measured;
            deviceStatus.textContent = `${measured.controlsSeen} controls measured, `
                + `${measured.smallTouchControls} small touch targets, ${measured.smallTextElements} small text nodes. `
                + measured.warnings.join(" ");
        }
        catch {
            deviceStatus.textContent = "Viewport measurement is unavailable on this browser.";
        }
    });
    download.addEventListener("click", () => {
        if (disposed)
            return;
        const evidence = buildAccessibilityEvidence(last, review.snapshot, focus.snapshot, pages.snapshot, keyboard.snapshot, lastResponsive);
        const blob = new Blob([serializeAccessibilityEvidence(evidence)], { type: "application/json" });
        const creator = URL;
        const address = creator.createObjectURL(blob);
        const anchor = element(doc, "a");
        anchor.href = address;
        anchor.download = "beljour-accessibility-review.json";
        doc.body.append(anchor);
        try {
            anchor.click();
        }
        finally {
            anchor.remove();
            browser.setTimeout(() => creator.revokeObjectURL(address), 1000);
        }
    });
    return {
        element: body,
        active: () => !disposed,
        close() {
            if (disposed)
                return;
            disposed = true;
            focus.dispose();
            keyboard.dispose();
            review.dispose();
            pages.dispose();
            tasks.clear();
            body.remove();
        },
    };
}
