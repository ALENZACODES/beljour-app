/** Accessible release-check screen composed from native controls. Author: John Khan. */
import { RELEASE_CHECKS, RELEASE_REFUSALS, releaseLink, } from "./catalogue.js";
import { PRO_COMMANDS } from "../continuous/pro-commands.js";
import { deviceCaveats } from "./device.js";
function el(doc, name, className = "", text) {
    const element = doc.createElement(name);
    if (className)
        element.className = className;
    if (text !== undefined)
        element.textContent = text;
    return element;
}
function button(doc, title, action, callback, disabled = false) {
    const element = el(doc, "button", "lg-button", title);
    element.type = "button";
    element.disabled = disabled;
    element.dataset.releaseAction = action;
    element.addEventListener("click", callback);
    return element;
}
function rowState(snapshot, id) {
    const row = snapshot.rows.find((candidate) => candidate.id === id);
    if (!row)
        throw new RangeError("Missing release row");
    if (row.state === "unobserved")
        return "Not visited in this rehearsal";
    if (row.state === "opened")
        return "Public route opened; outcome not verified";
    if (row.state === "reviewed")
        return "Operator reported reviewing this screen";
    return `Refused: ${row.refusal ?? "unclear-evidence"}`;
}
function checkRow(doc, definition, snapshot, actions) {
    const entry = el(doc, "li", "lg-release-check");
    entry.dataset.releaseCheck = definition.id;
    const heading = el(doc, "h3", "", definition.title);
    const classification = definition.classification === "operator"
        ? "Requires observing the actual application"
        : definition.classification === "device"
            ? "Requires measured real-device evidence"
            : "Requires independent evidence outside this browser";
    const label = el(doc, "p", "lg-small", classification);
    const expectation = el(doc, "p", "", definition.expectation);
    const proof = el(doc, "p", "lg-small", `Confirm: ${definition.proofNeeded}`);
    const state = el(doc, "p", "lg-small", rowState(snapshot, definition.id));
    state.setAttribute("role", "status");
    const controls = el(doc, "div", "lg-release-check-actions");
    const active = snapshot.phase === "running";
    const current = snapshot.rows.find((row) => row.id === definition.id);
    const link = releaseLink(definition.id);
    if (link) {
        const anchor = el(doc, "a", "lg-button", "Open actual screen");
        anchor.href = link;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.dataset.releaseRoute = definition.id;
        anchor.setAttribute("aria-label", `${definition.title}, open separate tab`);
        anchor.addEventListener("click", () => {
            if (active)
                actions.open(definition.id);
        });
        controls.append(anchor);
    }
    if (definition.classification === "operator") {
        controls.append(button(doc, "I inspected the real screen", `review-${definition.id}`, () => actions.review(definition.id), !active
            || (current.state !== "opened" && current.state !== "reviewed")));
        const reasonLabel = el(doc, "label", "lg-small", "Reason if this step cannot complete");
        const reason = el(doc, "select", "lg-release-reason");
        reason.setAttribute("aria-label", `${definition.title} refusal reason`);
        reason.dataset.releaseReason = definition.id;
        for (const value of RELEASE_REFUSALS) {
            const option = el(doc, "option", "", value.replaceAll("-", " "));
            option.value = value;
            reason.append(option);
        }
        reason.value = current.refusal ?? "feature-unavailable";
        reasonLabel.append(reason);
        controls.append(reasonLabel);
        controls.append(button(doc, "Record refusal", `refuse-${definition.id}`, () => actions.refuse(definition.id, reason.value), !active));
        controls.append(button(doc, "Clear this observation", `clear-${definition.id}`, () => actions.clear(definition.id), !active));
    }
    if (definition.classification !== "operator") {
        controls.append(el(doc, "p", "lg-small", definition.recovery));
    }
    entry.append(heading, label, expectation, proof, state, controls);
    return entry;
}
function commandPanel(doc, commands) {
    const section = el(doc, "section", "lg-card");
    section.setAttribute("aria-label", "Five Pro Commands readiness");
    section.append(el(doc, "h2", "", "Five Pro Commands"));
    section.append(el(doc, "p", "lg-small", "Names and availability come only from the public owner catalogue. "
        + "A catalogue entry does not certify rendering or identity retention."));
    const list = el(doc, "ul", "lg-release-command-list");
    for (const name of PRO_COMMANDS) {
        const found = commands.rows.find((row) => row.name === name);
        if (!found)
            throw new RangeError("Missing Pro Command");
        const item = el(doc, "li", "", `${found.name}: ${found.availability}. ${found.explanation}`);
        item.dataset.releaseCommand = name;
        list.append(item);
    }
    section.append(list);
    return section;
}
function devicePanel(doc, environment, sampling, actions, active) {
    const section = el(doc, "section", "lg-card");
    section.setAttribute("aria-label", "Local device preflight");
    section.append(el(doc, "h2", "", "Local browser preflight"));
    section.append(el(doc, "p", "lg-small", "Checks browser capabilities and draws synthetic pixels only. No image is uploaded."));
    section.append(button(doc, "Measure drawn Canvas", "measure-canvas", actions.runCanvas, !active));
    if (environment) {
        const line = [environment.canvasAvailable ? "Canvas present" : "Canvas missing",
            environment.encodingAvailable ? "PNG encoding interface present"
                : "PNG encoding interface missing",
            environment.online ? "Online signal" : "Offline signal"].join("; ");
        section.append(el(doc, "p", "lg-small", line));
        for (const caveat of deviceCaveats(environment)) {
            section.append(el(doc, "p", "lg-small", caveat));
        }
    }
    if (sampling) {
        section.append(el(doc, "p", "", sampling.status === "measured"
            ? `Canvas median ${sampling.medianMs} ms; p95 ${sampling.p95Ms} ms; n=${sampling.sampleCount}.`
            : "No valid Canvas timing was recorded."));
        section.append(el(doc, "p", "lg-small", sampling.note));
    }
    return section;
}
export function renderReleaseView(doc, host, snapshot, readiness, commands, environment, sampling, actions, message) {
    const content = el(doc, "section", "lg-release-workspace");
    content.dataset.releaseTheme = "french";
    const header = el(doc, "header", "lg-release-header");
    const title = el(doc, "h2", "", "Release readiness and real-demo transfer");
    title.id = "lg-release-heading";
    title.tabIndex = -1;
    header.append(title);
    header.append(el(doc, "p", "", "Use the real application links to perform a manual check. "
        + "No synthetic edit or checkbox certifies live YouCam or real-face quality."));
    const progress = el(doc, "p", "lg-release-progress", readiness.summary);
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    const phase = el(doc, "p", "lg-small", `Session ${snapshot.phase}; elapsed ${snapshot.elapsedMs} ms.`);
    const announcement = el(doc, "p", "lg-small", message);
    announcement.setAttribute("aria-live", "polite");
    const buttons = el(doc, "div", "lg-release-toolbar");
    buttons.append(button(doc, "Start review", "start", actions.start, snapshot.phase !== "not-started"));
    buttons.append(button(doc, "Stop review", "stop", actions.stop, snapshot.phase !== "running"));
    buttons.append(button(doc, "Clear all observations", "reset", actions.reset));
    buttons.append(button(doc, "Export photo-free report", "report", actions.report));
    const importLabel = el(doc, "label", "lg-small", "Inspect a prior photo-free report");
    const importInput = el(doc, "input", "lg-release-import");
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.dataset.releaseImport = "report";
    importInput.setAttribute("aria-label", "Choose a local release rehearsal JSON report");
    importInput.addEventListener("change", () => {
        const file = importInput.files?.[0] ?? null;
        importInput.value = "";
        actions.inspect(file);
    });
    importLabel.append(importInput);
    buttons.append(importLabel);
    buttons.append(button(doc, "Exit review", "exit", actions.exit));
    header.append(progress, phase, announcement, buttons);
    const preflight = devicePanel(doc, environment, sampling, actions, snapshot.phase === "running");
    const pro = commandPanel(doc, commands);
    const main = el(doc, "section", "lg-release-checklist");
    main.setAttribute("aria-labelledby", "lg-release-checks-heading");
    const checklistTitle = el(doc, "h2", "", "Check actual routes and independent evidence");
    checklistTitle.id = "lg-release-checks-heading";
    const list = el(doc, "ol", "lg-release-list");
    for (const definition of RELEASE_CHECKS) {
        list.append(checkRow(doc, definition, snapshot, actions));
    }
    main.append(checklistTitle, list);
    const footer = el(doc, "footer", "lg-release-footer");
    footer.append(el(doc, "p", "", "Release decision: not established by this browser."));
    footer.append(el(doc, "p", "lg-small", "Real-face and 100,000-face gates, licences, actual provider spend, the live demo, "
        + "real-device performance and submission assets require separate evidence."));
    content.append(header, preflight, pro, main, footer);
    host.replaceChildren(content);
}
//# sourceMappingURL=view.js.map