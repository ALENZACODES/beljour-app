export const OFFLINE_IMPORT_GUIDE = Object.freeze([
    Object.freeze({
        id: "prepare", title: "Prepare local files",
        instruction: "Use a local PNG and a separate JSON manifest containing dimensions and its SHA-256 digest.",
    }),
    Object.freeze({
        id: "consent", title: "Confirm local permission",
        instruction: "Select the drawn subject, consent to the relevant illustration and leave identity lock enabled.",
    }),
    Object.freeze({
        id: "inspect", title: "Inspect original bytes",
        instruction: "The browser checks PNG chunks, dimensions and digest in memory. No file is uploaded.",
    }),
    Object.freeze({
        id: "compare", title: "Review with limitations",
        instruction: "A digest match proves file integrity only, never that a provider produced the image.",
    }),
    Object.freeze({
        id: "clear", title: "Clear temporary access",
        instruction: "Changing subject or consent, clearing files or leaving the walkthrough "
            + "revokes the local preview URL.",
    }),
]);
const HELP = Object.freeze({
    empty: "Choose the JSON manifest and matching PNG. This is optional.",
    checking: "Keep this page open. The local check may take longer for a large PNG.",
    ready: "Bytes match. You may inspect the local preview, but provider origin is not authenticated.",
    refused: "Check the local PNG format, dimensions, digest and required permissions. No request was made.",
    stale: "The drawing or permissions changed. Re-select local files if you still want to inspect them.",
    disposed: "The local file inspection has ended. No preview reference remains active.",
});
export function offlineImportHelp(status) {
    if (!(status.phase in HELP))
        throw new RangeError("Unrecognized local import phase");
    return HELP[status.phase];
}
export function offlineImportReadiness(status) {
    return Object.freeze({
        safeToDisplay: status.phase === "ready" && status.verifiedFileIntegrity,
        providerUnverified: true,
        needOperatorReview: true,
        photoUploaded: false,
    });
}
export function offlineImportSummary(status) {
    const displayed = offlineImportReadiness(status).safeToDisplay ? "Local PNG integrity checked" : "No checked PNG";
    return `${displayed}. Live provider and real-face quality remain NOT VERIFIED.`;
}
//# sourceMappingURL=offline-import-guide.js.map