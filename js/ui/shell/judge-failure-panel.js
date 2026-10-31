/** Optional illustrative error and recovery controls, entirely offline. */
import { MOCK_FAILURE_CASES, } from "../../layout/judge-failure-replay.js";
import { judgeButton, judgeNode, judgeNotice, judgeParagraph, judgeStatus } from "./judge-elements.js";
export function renderJudgeFailurePanel(doc, host, replay, actions) {
    const section = judgeNode(doc, "section", "lg-judge-failure-panel");
    section.setAttribute("aria-label", "Optional mock-error rehearsal");
    const details = judgeNode(doc, "details", "lg-judge-failure-details");
    details.append(judgeNode(doc, "summary", "", "Practice an unavailable try-on (optional)"));
    details.append(judgeParagraph(doc, "These are fictional failure cases used to test the interface. No provider reply, "
        + "network request, photo upload or unit usage is being reproduced.", "lg-judge-small"));
    const controls = judgeNode(doc, "div", "lg-judge-failure-controls");
    for (const entry of MOCK_FAILURE_CASES) {
        const button = judgeButton(doc, entry.label, `failure-${entry.id}`, () => actions.simulate(entry.id));
        controls.append(button);
    }
    details.append(controls);
    const snapshot = replay.snapshot();
    details.open = snapshot.phase !== "idle";
    const result = judgeNode(doc, "section", "lg-judge-failure-result");
    result.dataset.judgeFailurePhase = snapshot.phase;
    result.setAttribute("aria-label", "Illustrative failure result");
    result.append(judgeStatus(doc, snapshot.message));
    if (snapshot.scenario) {
        result.append(judgeParagraph(doc, snapshot.reason, "lg-judge-small"));
        result.append(judgeNotice(doc, "What the person can do", snapshot.recovery));
        result.append(judgeParagraph(doc, "Source preserved. Simulated requests: 0. Provider result verified: no.", "lg-judge-small"));
    }
    const actionsHost = judgeNode(doc, "div", "lg-judge-failure-actions");
    const acknowledge = judgeButton(doc, "Acknowledge and prepare a manual retry", "failure-acknowledge", actions.acknowledge);
    acknowledge.disabled = snapshot.phase !== "simulated-refusal";
    const reset = judgeButton(doc, "Clear the illustration", "failure-reset", actions.reset);
    reset.disabled = snapshot.phase === "idle";
    actionsHost.append(acknowledge, reset);
    result.append(actionsHost);
    details.append(result);
    section.append(details);
    host.append(section);
}
