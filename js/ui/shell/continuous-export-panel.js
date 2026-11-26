export function renderContinuousExportStatus(doc, snapshot, receipt, actions) {
    const section = doc.createElement("section");
    section.className = "lg-cont-export-status";
    section.setAttribute("aria-label", "Local export status");
    const heading = doc.createElement("h3");
    heading.textContent = "Local file verification";
    const status = doc.createElement("p");
    status.className = "lg-cont-caption";
    status.dataset.exportPhase = snapshot.phase;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = snapshot.message;
    section.append(heading, status);
    if (snapshot.pending) {
        const cancel = doc.createElement("button");
        cancel.className = "lg-cont-button";
        cancel.dataset.tourAction = "cancel-export";
        cancel.type = "button";
        cancel.textContent = "Cancel pending export";
        cancel.addEventListener("click", actions.cancel);
        section.append(cancel);
    }
    if (snapshot.phase === "download-requested") {
        const detail = doc.createElement("p");
        detail.className = "lg-cont-caption";
        detail.textContent = `Local PNG inspected: ${snapshot.bytes ?? 0} bytes; `
            + `elapsed ${snapshot.durationMs ?? "unmeasured"} ms. `
            + "The browser does not confirm that the person saved or opened the file.";
        section.append(detail);
    }
    const verification = doc.createElement("p");
    verification.className = "lg-cont-caption";
    verification.dataset.receiptPhase = receipt.phase;
    verification.setAttribute("aria-live", "polite");
    verification.textContent = receipt.message;
    section.append(verification);
    if (receipt.available) {
        const label = doc.createElement("label");
        label.className = "lg-cont-receipt-picker";
        label.textContent = "Optionally reopen the downloaded PNG to check its exact bytes";
        const picker = doc.createElement("input");
        picker.type = "file";
        picker.accept = ".png,image/png";
        picker.dataset.tourAction = "verify-export-file";
        picker.setAttribute("aria-label", "Choose downloaded PNG for local file verification");
        picker.addEventListener("change", () => {
            const file = picker.files?.item(0) ?? null;
            actions.inspect(file);
            picker.value = "";
        });
        label.append(picker);
        section.append(label);
    }
    const disclosure = doc.createElement("p");
    disclosure.className = "lg-cont-caption";
    disclosure.textContent = "Synthetic drawn sample only. No photo uploads, "
        + "provider units, telemetry, live facial quality pass or download receipt.";
    section.append(disclosure);
    return section;
}
//# sourceMappingURL=continuous-export-panel.js.map