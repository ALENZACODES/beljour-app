/** Does not inspect browser versions, processor data, photos or user-agent strings. */
export function inspectOperatorDevice(input) {
    let canvas = false;
    let encoder = false;
    let download = false;
    let keyboardInput = false;
    try {
        const element = input.doc.createElement("canvas");
        canvas = typeof element.getContext === "function";
        encoder = typeof element.toBlob === "function";
    }
    catch {
        canvas = false;
        encoder = false;
    }
    try {
        const anchor = input.doc.createElement("a");
        download = "download" in anchor;
    }
    catch {
        download = false;
    }
    try {
        const inputElement = input.doc.createElement("input");
        keyboardInput = typeof inputElement.addEventListener === "function";
    }
    catch {
        keyboardInput = false;
    }
    const online = typeof input.online === "boolean" ? input.online : null;
    const supported = canvas && encoder && download && keyboardInput;
    const note = supported
        ? "Browser facilities detected; rendering correctness and physical-device speed unmeasured."
        : "One or more browser facilities are unavailable; use the normal fallback and report the refusal.";
    return Object.freeze({
        kind: "beljour-operator-device/1",
        supported,
        observedCapabilities: Object.freeze({ canvas, encoder, download, keyboardInput, online }),
        performanceMeasured: false,
        phoneVerified: false,
        photoSent: false,
        note,
    });
}
export function operatorDeviceCaption(result) {
    const capabilities = result.observedCapabilities;
    const count = [capabilities.canvas, capabilities.encoder,
        capabilities.download, capabilities.keyboardInput].filter(Boolean).length;
    return `${count}/4 local browser facilities detected. ${result.note} `
        + "No photo, personal device fingerprint, or network request was collected.";
}
