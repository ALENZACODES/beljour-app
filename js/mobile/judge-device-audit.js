function featureFromCall(check) {
    try {
        return check() ? "available" : "unavailable";
    }
    catch {
        return "unknown";
    }
}
export function safeJudgeViewportWidth(width) {
    if (typeof width !== "number" || !Number.isFinite(width) || width < 1)
        return null;
    return Math.round(Math.min(100000, width));
}
export function judgeMotionPreference(browser) {
    if (!browser?.matchMedia)
        return null;
    try {
        return Boolean(browser.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    catch {
        return null;
    }
}
/** Strictly checks feature presence, not GPU speed, API credit balance or photo safety. */
export function judgeDeviceAudit(doc, browser) {
    const width = safeJudgeViewportWidth(browser?.innerWidth);
    const canvas = featureFromCall(() => {
        const element = doc.createElement("canvas");
        return typeof element.getContext === "function" && element.getContext("2d") !== null;
    });
    const input = featureFromCall(() => {
        const element = doc.createElement("input");
        element.type = "file";
        return element.type === "file";
    });
    const bitmap = browser == null || browser.createImageBitmap === undefined
        ? "unknown"
        : typeof browser.createImageBitmap === "function" ? "available" : "unavailable";
    const download = featureFromCall(() => {
        return typeof browser?.URL?.createObjectURL === "function"
            && typeof browser?.URL?.revokeObjectURL === "function";
    });
    const viewport = width === null
        ? "unknown"
        : width >= 320 ? "available" : "unavailable";
    const rows = [
        {
            id: "canvas",
            label: "2D Canvas drawing",
            result: canvas,
            detail: "Needed to preview the synthetic illustration. Performance is not tested.",
        },
        {
            id: "local-upload",
            label: "Local image picker",
            result: input,
            detail: "The file picker stays on this device. No camera permission is requested.",
        },
        {
            id: "bitmap-decode",
            label: "Image bitmap decoding",
            result: bitmap,
            detail: "Optional local-photo uploads may fail on browsers without decoding support.",
        },
        {
            id: "local-export",
            label: "Local blob download",
            result: download,
            detail: "Actual download success must still be checked by a person on this device.",
        },
        {
            id: "viewport",
            label: "Layout viewport",
            result: viewport,
            detail: width === null
                ? "Width cannot be measured in this environment."
                : `Reported width: ${width}px. This is not a responsive-layout certification.`,
        },
    ];
    return {
        rows,
        viewportWidth: width,
        reducedMotion: judgeMotionPreference(browser),
        allVerified: false,
        disclaimer: "Capability hints only; mobile speed, browser compatibility and accessibility need device testing.",
    };
}
export function judgeDeviceSummaryText(summary) {
    const available = summary.rows.filter((row) => row.result === "available").length;
    const unavailable = summary.rows.filter((row) => row.result === "unavailable").length;
    const unknown = summary.rows.filter((row) => row.result === "unknown").length;
    const motion = summary.reducedMotion === null
        ? "Motion preference unknown"
        : summary.reducedMotion ? "Reduced motion requested" : "No reduced-motion request detected";
    return `${available} available, ${unavailable} unavailable, ${unknown} unknown. ${motion}. ${summary.disclaimer}`;
}
