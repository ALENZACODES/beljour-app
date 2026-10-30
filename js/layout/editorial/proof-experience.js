/** Proof Wall readout plus an explicit, private artwork export. Author: John Khan. */
import { downloadProofGraphic } from "./proof-graphic.js";
import { EditorialPacingProbe, frameClockForDocument, pacingCaption, } from "./frame-pacing.js";
import { proofWallReading, renderProofWall } from "./proof.js";
export function renderProofExperience(doc, input) {
    const root = doc.createElement("section");
    root.className = "lg-editorial-proof-experience";
    root.setAttribute("aria-label", "Local Proof Wall review and image handoff");
    root.append(renderProofWall(doc, proofWallReading(input)));
    const footer = doc.createElement("div");
    footer.className = "lg-editorial-proof-actions";
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "lg-editorial-proof-export";
    button.dataset.editorialAction = "proof-export";
    button.textContent = "Export local Proof Wall graphic";
    button.addEventListener("click", () => {
        try {
            downloadProofGraphic(doc, input);
            status.textContent = "Graphic download requested. Saved file is not confirmed.";
        }
        catch {
            status.textContent = "Graphic unavailable. No provider request was made.";
        }
    });
    const status = doc.createElement("p");
    status.className = "lg-editorial-proof-export-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Generated locally, without names, photographs or provider assertions.";
    footer.append(button, status);
    const clock = frameClockForDocument(doc);
    const pacing = doc.createElement("button");
    pacing.type = "button";
    pacing.className = "lg-editorial-proof-export";
    pacing.dataset.editorialAction = "frame-pacing";
    pacing.textContent = "Check frame pacing on this device";
    const pacingStatus = doc.createElement("p");
    pacingStatus.className = "lg-editorial-proof-export-status";
    pacingStatus.setAttribute("role", "status");
    pacingStatus.setAttribute("aria-live", "polite");
    pacingStatus.textContent = "Optional motion timing, not a preview or 60fps certification.";
    pacing.disabled = clock === null;
    const probe = clock ? new EditorialPacingProbe(clock) : null;
    pacing.addEventListener("click", () => {
        if (!probe || probe.running)
            return;
        pacing.disabled = true;
        pacingStatus.textContent = "Measuring local animation frames only.";
        void probe.start().then((report) => {
            pacingStatus.textContent = pacingCaption(report);
            pacing.disabled = false;
        });
    });
    footer.append(pacing, pacingStatus);
    root.append(footer);
    return root;
}
//# sourceMappingURL=proof-experience.js.map