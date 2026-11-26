export const PASS_DEFINITIONS = [
    {
        filterId: "playful_paws",
        label: "Playful Paws",
        minimumChangedFraction: .005,
        protectedUnchanged: 1,
        irisUnchanged: 1,
        alphaUnchanged: 1,
        note: "Original overlays preserve supplied identity marks and iris pixels exactly.",
    },
    {
        filterId: "archive_flash",
        label: "Archive Flash",
        minimumChangedFraction: .20,
        protectedUnchanged: 1,
        irisUnchanged: 1,
        alphaUnchanged: 1,
        note: "Photo treatment preserves protected marks and iris colour exactly.",
    },
    {
        filterId: "iris_tint",
        label: "Iris Tint",
        minimumChangedFraction: .001,
        protectedUnchanged: 1,
        irisUnchanged: null,
        alphaUnchanged: 1,
        note: "Iris colour is editable; pupil, highlights and supplied identity marks are protected.",
    },
    {
        filterId: "atelier_frames",
        label: "Atelier Frames",
        minimumChangedFraction: .002,
        protectedUnchanged: 1,
        irisUnchanged: 1,
        alphaUnchanged: 1,
        note: "Frame art must not recolour the iris or supplied identity marks.",
    },
    {
        filterId: "sunlit_skin",
        label: "Sunlit Skin",
        minimumChangedFraction: .02,
        protectedUnchanged: 1,
        irisUnchanged: 1,
        alphaUnchanged: 1,
        note: "Skin-only warmth preserves iris colour and supplied natural marks.",
    },
    {
        filterId: "ceremony_light_check",
        label: "Ceremony Light Check",
        minimumChangedFraction: .02,
        protectedUnchanged: 1,
        irisUnchanged: 1,
        alphaUnchanged: 1,
        note: "Local makeup may change allowed masks only; iris and identity marks remain exact.",
    },
];
export function definition(filterId) {
    const found = PASS_DEFINITIONS.find(item => item.filterId === filterId);
    if (!found)
        throw new Error(`unknown filter id ${filterId}`);
    return found;
}
function unchangedFraction(before, after, mask) {
    let total = 0;
    let same = 0;
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] === 0)
            continue;
        total += 1;
        let equal = true;
        for (let c = 0; c < 4; c += 1) {
            if (before[i * 4 + c] !== after[i * 4 + c])
                equal = false;
        }
        if (equal)
            same += 1;
    }
    return total === 0 ? 1 : same / total;
}
export function changedFraction(before, after) {
    if (before.length !== after.length || before.length % 4 !== 0) {
        throw new Error("before and after shapes must match");
    }
    let changed = 0;
    for (let i = 0; i < before.length / 4; i += 1) {
        let differs = false;
        for (let c = 0; c < 4; c += 1) {
            if (before[i * 4 + c] !== after[i * 4 + c])
                differs = true;
        }
        if (differs)
            changed += 1;
    }
    return changed / (before.length / 4);
}
export function alphaUnchangedFraction(before, after) {
    if (before.length !== after.length || before.length % 4 !== 0) {
        throw new Error("before and after shapes must match");
    }
    let same = 0;
    const count = before.length / 4;
    for (let i = 0; i < count; i += 1) {
        if (before[i * 4 + 3] === after[i * 4 + 3])
            same += 1;
    }
    return same / count;
}
export function measureIdentity(before, after, protectedMask, iris) {
    return {
        changedFraction: changedFraction(before, after),
        protectedUnchanged: unchangedFraction(before, after, protectedMask),
        irisUnchanged: iris ? unchangedFraction(before, after, iris) : null,
        alphaUnchanged: alphaUnchangedFraction(before, after),
    };
}
export function evaluate(filterId, before, after, protectedMask, iris) {
    const spec = definition(filterId);
    const metrics = measureIdentity(before, after, protectedMask, iris);
    const failures = [];
    if (metrics.changedFraction + 1e-12 < spec.minimumChangedFraction) {
        failures.push("effect below minimum changed-pixel fraction");
    }
    if (metrics.protectedUnchanged + 1e-12 < spec.protectedUnchanged) {
        failures.push("protected identity pixels changed");
    }
    if (spec.irisUnchanged !== null) {
        if (metrics.irisUnchanged === null)
            failures.push("iris evidence missing");
        else if (metrics.irisUnchanged + 1e-12 < spec.irisUnchanged)
            failures.push("iris colour pixels changed");
    }
    if (metrics.alphaUnchanged + 1e-12 < spec.alphaUnchanged)
        failures.push("alpha channel changed");
    return { filterId, metrics, passed: failures.length === 0, failures };
}
export function validateDefinitions() {
    const expected = [
        "playful_paws",
        "archive_flash",
        "iris_tint",
        "atelier_frames",
        "sunlit_skin",
        "ceremony_light_check",
    ];
    const ids = PASS_DEFINITIONS.map(item => item.filterId);
    const problems = [];
    if (new Set(ids).size !== expected.length || expected.some(id => !ids.includes(id))) {
        problems.push("pass-definition ids do not match the six R19B filters");
    }
    for (const item of PASS_DEFINITIONS) {
        if (item.minimumChangedFraction < 0 || item.minimumChangedFraction > 1) {
            problems.push(`${item.filterId}: changed fraction out of range`);
        }
        if (item.protectedUnchanged !== 1 || item.alphaUnchanged !== 1) {
            problems.push(`${item.filterId}: identity and alpha thresholds must remain exact`);
        }
        if (item.filterId !== "iris_tint" && item.irisUnchanged !== 1) {
            problems.push(`${item.filterId}: iris threshold must remain exact`);
        }
        if (item.filterId === "iris_tint" && item.irisUnchanged !== null) {
            problems.push("iris_tint intentionally changes iris colour");
        }
    }
    return problems;
}
//# sourceMappingURL=evaluation.js.map