/** Native controls for opt-in, drawn-only seven-step editor replay. */
/** Author: John Khan. */
import { LOCAL_EDIT_SEQUENCE, sequenceReadableStatus, } from "../../layout/continuous/sequence-contract.js";
import { judgeNode, judgeParagraph } from "./judge-elements.js";
function namedButton(doc, action, title, enabled, callback) {
    const button = judgeNode(doc, "button", "lg-cont-button", title);
    button.dataset.tourAction = action;
    button.type = "button";
    button.disabled = !enabled;
    button.addEventListener("click", callback);
    return button;
}
/** Only fixed descriptions of drawn actions are rendered, never content from photos. */
export function renderLocalSequencePanel(doc, snapshot, actions) {
    const panel = judgeNode(doc, "section", "lg-cont-sequence");
    panel.setAttribute("aria-label", "Seven local illustration steps");
    panel.dataset.sequencePhase = snapshot.phase;
    const heading = judgeNode(doc, "h3", "", "Local seven-edit replay");
    const intro = judgeParagraph(doc, "After you personally opt in, this can show seven drawn edits in order. "
        + "It stops before Pro Commands, YouCam and download. No live service runs.", "lg-cont-caption");
    const status = judgeParagraph(doc, sequenceReadableStatus(snapshot), "lg-cont-sequence-status");
    status.dataset.sequenceStatus = snapshot.reason;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    const progress = judgeNode(doc, "progress", "lg-cont-sequence-meter");
    progress.max = snapshot.total;
    progress.value = snapshot.completed.length;
    progress.setAttribute("aria-label", "Local illustration progress");
    const count = judgeParagraph(doc, `${snapshot.completed.length} / ${snapshot.total} illustrated steps`, "lg-cont-caption");
    const timeline = judgeNode(doc, "ol", "lg-cont-sequence-list");
    const completed = new Set(snapshot.completed.map((item) => item.effect));
    for (const step of LOCAL_EDIT_SEQUENCE) {
        const item = judgeNode(doc, "li", "lg-cont-sequence-item");
        const done = completed.has(step.effect);
        const current = step.effect === snapshot.nextEffect && snapshot.phase !== "complete";
        item.dataset.sequenceStep = step.effect;
        item.dataset.sequenceState = done ? "done" : current ? "next" : "pending";
        const label = judgeNode(doc, "strong", "", step.title);
        const evidence = done ? "Drawn edit observed" : current ? "Next drawn edit" : "Not yet applied";
        const note = judgeParagraph(doc, `${evidence}. ${step.caption}`, "lg-cont-caption");
        item.append(label, note);
        timeline.append(item);
    }
    const controls = judgeNode(doc, "div", "lg-cont-sequence-actions");
    controls.append(namedButton(doc, "sequence-play", "Play seven local edits", snapshot.canStart, actions.play), namedButton(doc, "sequence-pause", "Pause drawn replay", snapshot.canPause, actions.pause), namedButton(doc, "sequence-resume", "Resume drawn replay", snapshot.canResume, actions.resume), namedButton(doc, "sequence-advance", "One local edit", snapshot.canAdvance, actions.advance), namedButton(doc, "sequence-stop", "Stop drawn replay", snapshot.phase === "running" || snapshot.phase === "paused", actions.stop), namedButton(doc, "sequence-clear", "Clear replay progress", snapshot.phase !== "idle", actions.clear), namedButton(doc, "sequence-shotlist", "Save photo-free rehearsal shot list", snapshot.phase === "complete", actions.shotList));
    const disclosure = judgeParagraph(doc, snapshot.autoAllowed
        ? "Automatic replay runs only after your click and may be paused at any time."
        : "Reduced motion preference: use One local edit. Automatic replay is disabled.", "lg-cont-caption");
    const external = judgeParagraph(doc, "A local illustration does not prove accurate face detection, identity preservation, "
        + "provider use, Pro Command execution, real-face results or release acceptance.", "lg-cont-caption");
    const elapsed = judgeParagraph(doc, `Elapsed rehearsal clock: ${snapshot.elapsedMs.toFixed(1)} ms, including pauses between edits. `
        + "Not a phone performance measurement.", "lg-cont-caption");
    panel.append(heading, intro, status, progress, count, timeline, controls, disclosure, external, elapsed);
    return panel;
}
