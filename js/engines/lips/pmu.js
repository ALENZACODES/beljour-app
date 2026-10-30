export const PMU_STATES = { fresh: { name: "fresh",
        pigmentStrength: 0.78,
        saturationScale: 1.08,
        valueScale: 0.92,
        edgeSoftness: 0.12,
        label: "Illustrative fresh appearance; swelling and healing are not predicted.",
    },
    healed: { name: "healed",
        pigmentStrength: 0.48,
        saturationScale: 0.92,
        valueScale: 1.00,
        edgeSoftness: 0.20,
        label: "Healed is the default consultation state; retention varies by person and pigment.",
    },
    month_6: { name: "month_6",
        pigmentStrength: 0.38,
        saturationScale: 0.86,
        valueScale: 1.01,
        edgeSoftness: 0.24,
        label: "Illustrative fade state, not a six-month retention promise.",
    },
    month_12: { name: "month_12",
        pigmentStrength: 0.28,
        saturationScale: 0.80,
        valueScale: 1.02,
        edgeSoftness: 0.28,
        label: "Illustrative fade state, not a twelve-month retention promise.",
    },
    month_18: { name: "month_18",
        pigmentStrength: 0.18,
        saturationScale: 0.74,
        valueScale: 1.03,
        edgeSoftness: 0.32,
        label: "Illustrative fade state, not an eighteen-month retention promise.",
    },
};
export function pmuState(name) {
    const value = PMU_STATES[name];
    if (!value)
        throw new RangeError("unknown permanent-makeup display state");
    return value;
}
export function pmuStrengths() { return ["fresh", "healed", "month_6", "month_12", "month_18"].map(name => pmuState(name).pigmentStrength); }
export function pmuFadeIsMonotonic() { const values = pmuStrengths(); return values.slice(1).every((value, index) => values[index] > value); }
export function pmuPigmentColour(base, display) {
    const rgb = base.map(value => value / 255);
    const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
    const adjusted = rgb.map(value => mean * display.valueScale + (value - mean) * display.saturationScale);
    return adjusted.map(value => Math.max(0, Math.min(255, Math.round(value * 255))));
}
export function pmuDisclosure(twoToneBalance, skinDepth) {
    const warnings = [
        "Patch testing, healing and pigment response need a qualified professional.",
        "This preview does not predict retention, scarring, allergy or final healed colour.",
    ];
    if (twoToneBalance < 0.35 || twoToneBalance > 0.65) {
        warnings.push("Visible two-tone lip pigmentation may heal unevenly; the preview preserves the starting difference.");
    }
    if (skinDepth !== null && skinDepth >= 0.65) {
        warnings.push("Melanin-rich lips can shift and retain pigment differently; a specialist consultation is important.");
    }
    return warnings;
}
//# sourceMappingURL=pmu.js.map