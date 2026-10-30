/** Optional manual bridge from the drawn demonstration into real application pages. */
import { operatorRefusalText, } from "../../layout/continuous/operator-contract.js";
import { operatorClockCaption } from "../../layout/continuous/operator-timer.js";
import { operatorGaps, operatorScript } from "../../layout/continuous/operator-script.js";
import { judgeNode, judgeParagraph } from "./judge-elements.js";
function operatorButton(doc, text, action, callback) {
    const button = judgeNode(doc, "button", "lg-cont-operator-button", text);
    button.type = "button";
    button.dataset.tourAction = action;
    button.addEventListener("click", callback);
    return button;
}
/** Native links keep destination control in the visitor's browser. */
function operatorLink(doc, title, href, id, callback) {
    const anchor = judgeNode(doc, "a", "lg-cont-operator-link", title);
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.dataset.tourAction = `operator-open-${id}`;
    anchor.setAttribute("aria-label", `Open ${title} in a separate tab`);
    anchor.addEventListener("click", () => callback(id));
    return anchor;
}
export function renderContinuousOperator(doc, snapshot, actions) {
    const section = judgeNode(doc, "section", "lg-cont-operator");
    section.id = "lg-cont-operator";
    section.setAttribute("aria-label", "Manual real-product rehearsal");
    section.append(judgeNode(doc, "h3", "", "Real-product rehearsal (optional)"));
    section.append(judgeParagraph(doc, "This separate checklist opens existing application pages. No drawn image, "
        + "consent, recipe, or private data is transferred. Confirmations are operator self-reports, "
        + "not evidence of working YouCam APIs, identity accuracy, or release approval."));
    const header = judgeNode(doc, "div", "lg-cont-operator-toolbar");
    const clock = judgeParagraph(doc, operatorClockCaption(snapshot.clock));
    clock.id = "lg-cont-operator-clock";
    clock.setAttribute("aria-live", "polite");
    header.append(clock);
    if (snapshot.clock.status === "idle") {
        header.append(operatorButton(doc, "Start three-minute rehearsal", "operator-start", actions.start));
    }
    else if (snapshot.clock.status === "running") {
        header.append(operatorButton(doc, "Pause", "operator-pause", actions.pause));
        header.append(operatorButton(doc, "Finish", "operator-stop", actions.stop));
    }
    else if (snapshot.clock.status === "paused") {
        header.append(operatorButton(doc, "Resume", "operator-resume", actions.resume));
        header.append(operatorButton(doc, "Finish", "operator-stop", actions.stop));
    }
    section.append(header);
    const list = judgeNode(doc, "ol", "lg-cont-operator-list");
    const script = operatorScript();
    for (const row of snapshot.rows) {
        const scriptRow = script.find((entry) => entry.id === row.id);
        if (!scriptRow)
            throw new Error("Missing operator runbook entry");
        const item = judgeNode(doc, "li", "lg-cont-operator-item");
        item.dataset.operatorId = row.id;
        const name = judgeNode(doc, "h4", "", `${scriptRow.number}. ${row.title}`);
        item.append(name, judgeParagraph(doc, scriptRow.caption));
        item.append(judgeParagraph(doc, `Prerequisite: ${scriptRow.preflight}`, "lg-cont-caption"));
        item.append(judgeParagraph(doc, `Check: ${scriptRow.passCheck}`, "lg-cont-caption"));
        item.append(judgeParagraph(doc, scriptRow.accessibleHint, "lg-cont-caption"));
        const note = row.result === "refused" && row.refusal
            ? operatorRefusalText(row.refusal)
            : row.result === "self-reported"
                ? "Operator reported inspecting this route; no independent validation."
                : row.result === "opened"
                    ? "Route opened or opening attempted; result not confirmed."
                    : "Not visited in this rehearsal.";
        const status = judgeParagraph(doc, note, "lg-cont-operator-state");
        status.dataset.operatorState = row.result;
        item.append(status);
        const choices = judgeNode(doc, "div", "lg-cont-operator-actions");
        choices.append(operatorLink(doc, row.title, row.href, row.id, actions.visit));
        if (row.result === "opened" && snapshot.clock.status !== "stopped") {
            choices.append(operatorButton(doc, "I checked this screen", `operator-check-${row.id}`, () => actions.acknowledge(row.id)));
        }
        if (snapshot.clock.status === "running" || snapshot.clock.status === "paused") {
            const refusals = ["no-consent", "offline", "unavailable"];
            for (const reason of refusals) {
                const title = reason === "no-consent" ? "Consent unavailable"
                    : reason === "offline" ? "Offline" : "Operation unavailable";
                choices.append(operatorButton(doc, title, `operator-refuse-${row.id}-${reason}`, () => actions.refuse(row.id, reason)));
            }
            if (row.result !== "not-started") {
                choices.append(operatorButton(doc, "Clear mark", `operator-clear-${row.id}`, () => actions.clear(row.id)));
            }
        }
        item.append(choices);
        list.append(item);
    }
    section.append(list);
    const gaps = operatorGaps(snapshot);
    section.append(judgeParagraph(doc, `${snapshot.counts.selfReported} of ${snapshot.counts.total} screens manually checked; `
        + `${snapshot.counts.refused} refused; ${snapshot.counts.notStarted} not started.`, "lg-cont-caption"));
    for (const advice of gaps.advice)
        section.append(judgeParagraph(doc, advice, "lg-cont-caption"));
    section.append(operatorButton(doc, "Download photo-free rehearsal record", "operator-report", actions.export));
    section.append(judgeParagraph(doc, "Separate verification is required for live YouCam, real faces, device budgets and the frozen release gate.", "lg-cont-caption"));
    return section;
}
//# sourceMappingURL=continuous-operator-panel.js.map