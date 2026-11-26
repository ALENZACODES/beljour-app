function row(code, title, status, evidence, nextCheck) {
    return { code, title, status, evidence, nextCheck };
}
/** Fixed no-claim result until separately authorized external checks are supplied. */
export function judgeDemoReadiness(witness, ledger, device) {
    const rows = [
        row("local-walkthrough", "Eight-step local walkthrough", witness.allDemoActionsObserved ? "observed-locally" : "incomplete", `${witness.observed} of 8 local actions observed; ${witness.skipped} skipped.`, "Perform every local action on the submitted browser build."),
        row("download-request", "Labelled export request", ledger.requestMade ? "observed-locally" : "incomplete", ledger.requestMade
            ? "Browser download initiated; saved-file arrival is not verified."
            : "No image download request recorded in this visit.", "Open the saved file on a real device and inspect its permanent label."),
        row("canvas-capability", "Canvas availability", device.canRunIllustration ? "observed-locally" : "incomplete", device.canRunIllustration
            ? "The browser provides a 2D Canvas; effect quality was not measured."
            : "No working local 2D Canvas observed by preflight.", "Exercise real preview, decode, memory and export paths on the target device."),
        row("real-photo-reading", "Skin reading on a real photo", "not-checked", "This guide uses drawings, so it cannot show how the on-device reader does on a real photo.", "Open Skin Moment, add a real photo and check that the reading and plan make sense."),
        row("hosted-demo", "Free hosted demonstration", "not-checked", "No public Pages URL, uptime or security header was checked here.", "After authorization, verify the judge URL, CSP, no-charge access and availability."),
        row("device-only-processing", "Photos stay on the device", "not-checked", "This guide uploads nothing; the rest of the app's network use is not observed here.", "Open the browser's network panel on the real pages and confirm no photo leaves the device."),
        row("physical-mobile", "Physical phone and screen reader", "not-checked", "A desktop DOM test or Canvas support does not certify a phone or WCAG compliance.", "Test 320px/390px layouts, keyboard, VoiceOver/TalkBack and actual device latency."),
        row("frozen-face-gate", "Frozen-set quality release gate", "not-checked", "No real-face quality, fairness or 100,000-face release result is produced here.", "Run the frozen set on authorized external faces, keeping missing evidence unproven."),
        row("commercial-licence", "Commercial model and service rights", "not-checked", "Browser UI checks do not establish model provenance or service rights.", "Resolve all outstanding rights and the exact shipped-asset ledger."),
    ];
    return {
        rows,
        localObserved: rows.filter((value) => value.status === "observed-locally").length,
        externalChecksPending: rows.filter((value) => value.status === "not-checked").length,
        status: "rehearsal-only",
        confirmsLiveYouCam: false,
        clearsPublicRelease: false,
    };
}
export function judgeReadinessLabel(value) {
    if (value === "observed-locally")
        return "Observed on this browser";
    if (value === "incomplete")
        return "Incomplete";
    return "Requires separate verification";
}
//# sourceMappingURL=judge-demo-readiness.js.map