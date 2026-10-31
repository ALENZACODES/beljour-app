/** No photos, screenshots or user input leave this one-screen layout check. */
import { describeJudgeDeviceCheck, measureJudgeCurrentScreen } from "../../mobile/judge-device-selfcheck.js";
import { judgeButton, judgeNode, judgeNotice, judgeParagraph, judgeStatus } from "./judge-elements.js";
export function renderJudgeDeviceSelfCheckPanel(doc, host, root) {
    const details = judgeNode(doc, "details", "lg-judge-selfcheck-panel");
    details.append(judgeNode(doc, "summary", "", "Inspect current screen layout (optional)"));
    details.append(judgeParagraph(doc, "The scan measures currently rendered control sizes and overflow. "
        + "It cannot verify touch accuracy, assistive speech or full-device performance.", "lg-judge-small"));
    const status = judgeStatus(doc, "No screen measurement has been requested.");
    const action = judgeButton(doc, "Measure current screen", "device-selfcheck", () => {
        action.disabled = true;
        try {
            const result = measureJudgeCurrentScreen(doc, root);
            status.textContent = describeJudgeDeviceCheck(result);
            status.dataset.judgeDeviceMeasured = "true";
        }
        catch {
            status.textContent = "This browser cannot measure the layout. Manual inspection is still needed.";
            status.dataset.judgeDeviceMeasured = "false";
        }
        finally {
            action.disabled = false;
        }
    });
    details.append(action, status);
    details.append(judgeNotice(doc, "Not a mobile certification", "Test an actual mid-range phone and keyboard/screen reader separately. "
        + "No screenshot or private data is saved by this diagnostic."));
    host.append(details);
}
