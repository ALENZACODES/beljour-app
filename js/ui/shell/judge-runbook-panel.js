import { judgeWitnessLabel } from "../../layout/judge-proof-policy.js";
import { judgeNode, judgeNotice, judgeParagraph } from "./judge-elements.js";
function addFact(doc, title, detail) {
    const item = judgeNode(doc, "div", "lg-judge-cue-fact");
    item.append(judgeNode(doc, "dt", "", title));
    item.append(judgeNode(doc, "dd", "", detail));
    return item;
}
export function renderJudgeRunbookPanel(doc, host, summary, witness, options = {}) {
    const details = judgeNode(doc, "details", "lg-judge-cue-panel");
    details.open = options.expanded ?? false;
    details.append(judgeNode(doc, "summary", "lg-judge-cue-toggle", "Three-minute demo talk track"));
    const content = judgeNode(doc, "div", "lg-judge-cue-body");
    content.append(judgeParagraph(doc, "Suggested pacing is a rehearsal aid, not a measured API or phone speed budget.", "lg-judge-small"));
    const facts = judgeNode(doc, "dl", "lg-judge-cue-facts");
    facts.append(addFact(doc, "Current step", `${summary.active.number} of ${summary.rows.length}`), addFact(doc, "Suggested finish for this step", summary.active.targetLabel), addFact(doc, "Elapsed this rehearsal", `${Math.floor(summary.actualMs / 1000)} seconds`));
    content.append(facts);
    const current = judgeNode(doc, "section", "lg-judge-cue-current");
    current.setAttribute("aria-label", "Current demo speaking notes");
    current.append(judgeNode(doc, "h3", "lg-judge-section-title", "What to say and show"));
    current.append(judgeParagraph(doc, summary.active.instruction));
    current.append(judgeParagraph(doc, summary.active.narration));
    current.append(judgeNotice(doc, "Important limitation", summary.active.honestBoundary));
    current.append(judgeParagraph(doc, `Keyboard: ${summary.active.keyboard}`, "lg-judge-small"));
    current.append(judgeParagraph(doc, `Recovery: ${summary.active.recovery}`, "lg-judge-small"));
    content.append(current);
    const list = judgeNode(doc, "ol", "lg-judge-cue-timeline");
    list.setAttribute("aria-label", "Suggested rehearsal timeline");
    for (const item of summary.rows) {
        const status = witness.rows.find((row) => row.id === item.step)?.status ?? "not-observed";
        const li = judgeNode(doc, "li", "lg-judge-cue-stop");
        li.dataset.judgeCueStatus = status;
        if (item.step === summary.active.step)
            li.setAttribute("aria-current", "step");
        li.append(judgeNode(doc, "strong", "", `${item.number}. ${item.step}`));
        li.append(judgeParagraph(doc, `Target ${item.targetLabel} · ${judgeWitnessLabel(status)}`, "lg-judge-small"));
        list.append(li);
    }
    content.append(list);
    if (summary.timeStatus === "over-rehearsal-target") {
        content.append(judgeNotice(doc, "Rehearsal over target", "This elapsed time is not a phone benchmark. Finish with accurate disclosures."));
    }
    content.append(judgeParagraph(doc, "The live application, user consent and approved YouCam API path require their own separate test.", "lg-judge-small"));
    details.append(content);
    host.append(details);
}
//# sourceMappingURL=judge-runbook-panel.js.map