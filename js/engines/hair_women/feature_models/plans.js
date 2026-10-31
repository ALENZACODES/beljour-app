const finite = (v, name) => { if (!Number.isFinite(v))
    throw new RangeError(`${name} must be finite`); return v; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, finite(v, "value")));
export function curlShrinkage(curl) { const c = clamp(curl, 0, 1); return .03 + .24 * c ** 1.35; }
export function wornLength(stretched, curl) { return clamp(stretched, .8, 2.4) * (1 - curlShrinkage(curl)); }
export function clipInPlan(amount, lengthRatio, volume, curl, crownY) {
    const attachmentY = Math.min(.78, clamp(crownY, .05, .70) + .24);
    const stretchedRatio = clamp(lengthRatio, 1, 2.2);
    const wornRatio = wornLength(stretchedRatio, curl);
    const blendRatio = 1 - Math.min(.45, Math.abs(stretchedRatio - 1) * .24 + volume * .05);
    const warnings = [];
    if (stretchedRatio > 1.75)
        warnings.push("Long extension previews need an in-person weight and attachment check.");
    if (curl > .7)
        warnings.push("Worn length is shown separately because curl shrinkage is substantial.");
    return { attachmentY, stretchedRatio, wornRatio, blendRatio, volumeRatio: clamp(volume, 0, 1.5), warnings };
}
export function integrationPlan(method, base) {
    const shift = method === "tape" ? .025 : .045;
    return { ...base, attachmentY: clamp(base.attachmentY + shift, .1, .82), blendRatio: Math.max(.45, base.blendRatio - (method === "sew_in" ? .03 : 0)), warnings: [...base.warnings, "Attachment placement is a visual guide, not a tension or scalp-safety assessment."] };
}
export function topperPlan(amount, volume, crown) {
    return { centreX: clamp(crown[0], .2, .8), centreY: clamp(crown[1], .08, .6), radiusX: .14 + .05 * clamp(volume, 0, 1.5), radiusY: .11 + .04 * clamp(volume, 0, 1.5), densityGain: .18 + .32 * clamp(amount, 0, 1), label: "topper density simulation; fit and attachment require an in-person check" };
}
export function wigPlan(amount, volume, leftTemple, rightTemple, crownY) {
    const templeSpan = Math.abs(rightTemple[0] - leftTemple[0]);
    return { capWidthRatio: clamp(templeSpan * 1.28, .32, .72), crownY: clamp(crownY, .05, .6), hairlineSoftness: .35 + clamp(amount, 0, 1) * .45, volume: clamp(volume, 0, 1.5), simulation: true, label: "fashion wig appearance only; fit, ventilation and comfort are not measured" };
}
export function rootDepth(amount, rootWidth = .1) { return { bandRatio: clamp(rootWidth, .03, .22), opacity: .20 + .62 * clamp(amount, 0, 1), label: "root colour simulation" }; }
export function moneyPiece(amount, faceWidth = .42) {
    const a = clamp(amount, 0, 1), width = clamp(faceWidth * (.10 + .05 * a), .035, .16), weight = .35 + .55 * a;
    return [{ start: .18, end: .18 + width, weight, side: "left" }, { start: .82 - width, end: .82, weight, side: "right" }];
}
export function foilMap(style, density, seed = 17) {
    const d = clamp(density, 0, 1), base = { babylights: 11, lowlights: 7, balanced: 9, chunky: 5, lived_in: 6 }[style], count = Math.max(2, Math.round(base * (.45 + .55 * d))), phase = (seed % 19) / 19;
    const bands = [];
    for (let i = 0; i < count; i++) {
        const centre = .08 + .84 * ((i + phase) / Math.max(count - 1 + phase, 1)), width = (style === "babylights" ? .012 : style === "chunky" ? .052 : .025) * (.8 + .4 * d);
        bands.push({ start: Math.max(0, centre - width), end: Math.min(1, centre + width), weight: .25 + .65 * d, side: "both" });
    }
    return bands;
}
export function ombreCurve(start, softness, samples = 17) {
    const s = clamp(start, .05, .9), soft = clamp(softness, .02, .4), n = Math.max(5, Math.min(Math.trunc(samples), 101));
    return Array.from({ length: n }, (_, i) => 1 / (1 + Math.exp(-((i / (n - 1) - s) / soft))));
}
export function splitPartition(partX, feather = .025) { const p = clamp(partX, .2, .8), f = clamp(feather, 0, .12); return { partX: p, leftEnd: Math.max(0, p - f), rightStart: Math.min(1, p + f) }; }
export function peekabooRegion(side, reveal) { const r = clamp(reveal, 0, 1); return { side, lowerStart: .52 - .10 * r, outerWidth: .18 + .14 * r, opacity: .25 + .65 * r }; }
export function curlDefinition(curl, amount) { const c = clamp(curl, 0, 1), a = clamp(amount, 0, 1); return { curlStrength: c, smoothing: Math.min(.42, .08 + .28 * a), definition: .18 + .62 * a, humidityRisk: 0, textureFloor: Math.max(.72, .94 - .16 * a), warning: "preserve observed curl frequency; appearance only" }; }
export function heatStyle(curl, shape, amount) { const c = clamp(curl, 0, 1), s = clamp(shape, 0, 1), a = clamp(amount, 0, 1); return { curlStrength: c, smoothing: Math.min(.55, .12 + .34 * s * a), definition: Math.max(.12, c * (1 - .45 * s * a)), humidityRisk: 0, textureFloor: Math.max(.68, .92 - .22 * s * a), warning: "heat-style appearance only; follow tool safety guidance" }; }
export function humidityResponse(humidity, curl, porosity = .5) { const h = clamp(humidity > 1 ? humidity / 100 : humidity, 0, 1), c = clamp(curl, 0, 1), p = clamp(porosity, 0, 1), risk = clamp(.12 + .55 * h + .21 * c + .12 * p, 0, 1); return { curlStrength: c, smoothing: Math.max(0, .24 - .16 * risk), definition: Math.max(.1, c * (1 - .22 * risk)), humidityRisk: risk, textureFloor: .72, warning: "estimate from user-entered humidity; weather and hair response vary" }; }
export function greyTimeline(observed, months = 18, growth = 1.1) {
    const start = clamp(observed, 0, 1), count = Math.max(1, Math.min(Math.trunc(months), 36));
    return Array.from({ length: count + 1 }, (_, month) => { const progress = month / count, eased = 1 - (1 - progress) ** 1.35, natural = start + (1 - start) * eased, stage = progress < .25 ? "early contrast" : progress < .65 ? "blended transition" : "mostly natural"; return { month, naturalFraction: natural, colouredFraction: 1 - natural, regrowthCm: month * growth, transitionStage: stage }; });
}
export function greyMonotone(rows) { return rows.every((row, i) => i === 0 || row.naturalFraction + 1e-12 >= rows[i - 1].naturalFraction); }
