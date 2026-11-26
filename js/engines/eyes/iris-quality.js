function maskChecked(mask, size) {
    if (mask.length !== size)
        throw new RangeError("iris tone mask must match image dimensions");
    for (let i = 0; i < size; i++) {
        if (!Number.isFinite(mask[i]) || mask[i] < 0 || mask[i] > 1) {
            throw new RangeError("iris tone mask must be finite in 0..1");
        }
    }
}
function value(photo, pixel, channel) {
    return photo.data[pixel * photo.channels + channel];
}
function luminance(photo, pixel) {
    return value(photo, pixel, 0) * 0.2126 + value(photo, pixel, 1) * 0.7152
        + value(photo, pixel, 2) * 0.0722;
}
function correlation(sxx, syy, sxy, sx, sy, count) {
    if (count < 12)
        return null;
    const dx = sxx - sx * sx / count;
    const dy = syy - sy * sy / count;
    const denominator = Math.sqrt(Math.max(0, dx) * Math.max(0, dy));
    if (denominator <= 1e-12)
        return null;
    return Math.max(-1, Math.min(1, (sxy - sx * sy / count) / denominator));
}
export function irisToneQuality(before, after, irisMasks, pupilMasks) {
    if (before.width !== after.width || before.height !== after.height
        || before.channels !== after.channels || before.data.length !== after.data.length
        || before.data.length !== before.width * before.height * before.channels) {
        throw new RangeError("iris tone images need identical dimensions");
    }
    if (before.channels !== 3 && before.channels !== 4) {
        throw new RangeError("iris tone requires RGB or RGBA pixels");
    }
    const count = before.width * before.height;
    maskChecked(irisMasks.right_iris, count);
    maskChecked(irisMasks.left_iris, count);
    if (pupilMasks) {
        maskChecked(pupilMasks.right_iris, count);
        maskChecked(pupilMasks.left_iris, count);
    }
    let outsideMaxAbsDiff = 0;
    let alphaChanges = 0;
    const reports = [];
    const maskList = [irisMasks.right_iris, irisMasks.left_iris];
    const pupilList = pupilMasks ? [pupilMasks.right_iris, pupilMasks.left_iris] : [null, null];
    for (let index = 0; index < count; index++) {
        const supported = maskList.some(mask => mask[index] >= 0.5);
        for (let channel = 0; channel < 3; channel++) {
            const diff = Math.abs(value(before, index, channel) - value(after, index, channel));
            if (!supported)
                outsideMaxAbsDiff = Math.max(outsideMaxAbsDiff, diff);
        }
        if (before.channels === 4 && value(before, index, 3) !== value(after, index, 3)) {
            alphaChanges++;
        }
    }
    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const mask = maskList[sideIndex];
        const pupil = pupilList[sideIndex];
        let observedPixels = 0;
        let changedPixels = 0;
        let catchlightChanges = 0;
        let pupilChanges = 0;
        let totalDelta = 0;
        let totalLight = 0;
        let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < count; i++) {
            const supported = mask[i] >= 0.5;
            let largestDelta = 0;
            let totalRgbDelta = 0;
            let bright = true;
            for (let channel = 0; channel < 3; channel++) {
                const original = value(before, i, channel);
                const edited = value(after, i, channel);
                largestDelta = Math.max(largestDelta, Math.abs(edited - original));
                totalRgbDelta += Math.abs(edited - original);
                if (original < 245)
                    bright = false;
            }
            if (pupil && pupil[i] >= 0.5 && largestDelta > 0)
                pupilChanges++;
            if (!supported)
                continue;
            observedPixels++;
            if (largestDelta > 0) {
                changedPixels++;
                if (bright)
                    catchlightChanges++;
            }
            totalDelta += totalRgbDelta / 3;
            const first = luminance(before, i);
            const second = luminance(after, i);
            totalLight += second - first;
            sx += first;
            sy += second;
            sxx += first * first;
            syy += second * second;
            sxy += first * second;
        }
        const side = sideIndex === 0 ? "right_iris" : "left_iris";
        const texture = correlation(sxx, syy, sxy, sx, sy, observedPixels);
        reports.push({
            side, status: observedPixels ? "MEASURED" : "NOT_MEASURED",
            observedPixels, changedPixels,
            meanRgbShift: observedPixels ? totalDelta / observedPixels : null,
            meanLightnessShift: observedPixels ? totalLight / observedPixels : null,
            textureCorrelation: texture,
            catchlightChanges, pupilChanges: pupil === null ? null : pupilChanges,
        });
    }
    const failures = outsideMaxAbsDiff > 0 || alphaChanges > 0
        || reports.some(report => report.catchlightChanges > 0
            || (report.pupilChanges !== null && report.pupilChanges > 0));
    return {
        right: reports[0], left: reports[1], outsideMaxAbsDiff, alphaChanges,
        verdict: failures ? "FAIL" : "UNPROVEN",
    };
}
export function safeIrisToneReport(report) {
    return {
        format: "beljour-iris-tone/1", right: report.right, left: report.left,
        outside_max_abs_diff: report.outsideMaxAbsDiff,
        alpha_changes: report.alphaChanges,
        quality_verdict: report.verdict,
    };
}
/** An unobserved shape remains unknown to the existing frozen-set gate. */
export function measuredGateRow(report, options) {
    if (![0, 1, 2].includes(options.visibleIrises)) {
        throw new RangeError("measured visible iris count must be 0, 1 or 2");
    }
    if (options.shapeObserved !== null && typeof options.shapeObserved !== "boolean") {
        throw new RangeError("shape evidence must be observed or unknown");
    }
    if (typeof options.guardCalled !== "boolean") {
        throw new RangeError("guard evidence must be a boolean");
    }
    if (!Array.isArray(options.undeclaredMissing)
        || options.undeclaredMissing.some(reason => typeof reason !== "string")) {
        throw new RangeError("missing-iris codes must be an array of strings");
    }
    const catchlightUnchanged = [report.right, report.left].every(item => item.catchlightChanges === 0 && (item.pupilChanges === null || item.pupilChanges === 0));
    return {
        outside_unchanged: report.outsideMaxAbsDiff === 0 && report.alphaChanges === 0,
        catchlight_unchanged: catchlightUnchanged,
        shape_ok: options.shapeObserved,
        visible_irises: options.visibleIrises,
        undeclared_missing: [...options.undeclaredMissing],
        guard_called: options.guardCalled,
        quality_verdict: report.verdict,
    };
}
//# sourceMappingURL=iris-quality.js.map