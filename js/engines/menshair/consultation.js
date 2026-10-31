export const DEFAULT_CONSULTATION = {
    texture: "any", desired_length: "any", fade: "any", fade_shape: "any",
    presentation: "any", maintenance_minutes: 20, scalp_visibility: "unspecified",
    part: "any", require_short_sides: false, prefer_volume: false,
};
const TEXTURES = ["straight", "wavy", "curly", "coily", "any"];
const LENGTHS = ["short", "medium", "long", "any"];
const FADES = ["low", "mid", "high", "any"];
const SHAPES = ["classic", "skin", "drop", "burst", "temple", "shadow", "any"];
const PRESENTATIONS = ["masculine", "feminine", "unisex", "any"];
const COMPAT = {
    buzz: ["straight", "wavy", "curly", "coily"],
    crop: ["straight", "wavy", "curly"],
    taper: ["straight", "wavy", "curly", "coily"],
    fade: ["straight", "wavy", "curly", "coily"],
    "curly-fade": ["curly", "coily"], afro: ["coily", "curly"],
    coils: ["coily", "curly"], twists: ["coily", "curly"],
    locs: ["coily", "curly"], curls: ["curly", "coily"],
    waves: ["wavy", "curly", "straight"],
    braid: ["wavy", "curly", "coily", "straight"],
};
const SHORT = new Set(["buzz", "crew", "crop", "fade", "taper", "undercut",
    "pixie", "caesar", "ivy", "side-part", "flattop"]);
const LONG = new Set(["layers", "shoulder", "ponytail", "updo", "braid", "locs", "bun"]);
export function validateConsultation(p) {
    if (!TEXTURES.includes(p.texture) || !LENGTHS.includes(p.desired_length) ||
        !FADES.includes(p.fade) || !SHAPES.includes(p.fade_shape) ||
        !PRESENTATIONS.includes(p.presentation) ||
        !Number.isInteger(p.maintenance_minutes) || p.maintenance_minutes < 0 || p.maintenance_minutes > 180 ||
        !["unspecified", "keep", "reveal"].includes(p.scalp_visibility) ||
        !["none", "left", "right", "any"].includes(p.part) ||
        typeof p.require_short_sides !== "boolean" || typeof p.prefer_volume !== "boolean") {
        throw Error("Unsupported styling preference.");
    }
}
export function parseConsultation(raw) {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object")
        throw Error("Invalid style choices.");
    const value = raw;
    if (Object.keys(value).some((key) => !(key in DEFAULT_CONSULTATION)))
        throw Error("Unknown styling preference.");
    const p = { ...DEFAULT_CONSULTATION, ...value };
    validateConsultation(p);
    return p;
}
function cutLength(style) {
    const length = style.length ?? 0;
    if (SHORT.has(style.family) && length <= 35)
        return "short";
    if (LONG.has(style.family) && length >= 67)
        return "long";
    if (length <= 35)
        return "short";
    if (length >= 72)
        return "long";
    return "medium";
}
function textureFit(style, texture) {
    if (texture === "any")
        return true;
    const opts = COMPAT[style.family];
    if (opts)
        return opts.includes(texture);
    if (style.pattern === "curl" || style.pattern === "braid")
        return texture === "curly" || texture === "coily";
    if (style.pattern === "wave")
        return ["straight", "wavy", "curly"].includes(texture);
    return true;
}
function maintenance(style) {
    let minutes = 6;
    if (["pompadour", "quiff", "curtain", "updo"].includes(style.family))
        minutes += 7;
    if (["braid", "locs", "twists"].includes(style.family))
        minutes += 12;
    if (["curl", "wave", "braid"].includes(style.pattern ?? "plain"))
        minutes += 6;
    if ((style.fringe ?? 0) >= 60)
        minutes += 5;
    if ((style.length ?? 0) >= 68)
        minutes += 4;
    if ((style.definition ?? 50) >= 80)
        minutes += 5;
    return minutes;
}
function shortSides(style) {
    return SHORT.has(style.family) || ((style.side_bias ?? 0) >= 55 &&
        (style.fade_shape ?? "classic") !== "classic");
}
export function scoreStyle(style, p) {
    validateConsultation(p);
    let points = 10;
    const reasons = [], cautions = ["Requires your own stylist's assessment; not a haircut outcome"];
    const length = cutLength(style);
    if (p.desired_length === "any")
        reasons.push("Length unrestricted by your choices");
    else if (p.desired_length === length) {
        points += 24;
        reasons.push("Requested length category");
    }
    else {
        points -= 12;
        cautions.push("Different length category than requested");
    }
    if (p.texture === "any")
        reasons.push("No hair texture assumptions");
    else if (textureFit(style, p.texture)) {
        points += 19;
        reasons.push("Compatible editorial texture tag");
    }
    else {
        points -= 10;
        cautions.push("Texture compatibility not verified; ask a stylist");
    }
    if (p.fade !== "any") {
        if (style.fade === p.fade) {
            points += 15;
            reasons.push("Chosen fade height");
        }
        else
            points -= 5;
    }
    if (p.fade_shape !== "any") {
        if ((style.fade_shape ?? "classic") === p.fade_shape) {
            points += 20;
            reasons.push("Chosen fade geometry");
        }
        else
            points -= 6;
    }
    if (p.require_short_sides) {
        if (shortSides(style)) {
            points += 20;
            reasons.push("Short-sided concept");
        }
        else
            points -= 22;
    }
    if (p.presentation !== "any") {
        if ((style.presentation ?? "unisex") === p.presentation || (style.presentation ?? "unisex") === "unisex") {
            points += 7;
            reasons.push("Requested browse style label, not wearer identity");
        }
        else
            points -= 3;
    }
    if (p.part !== "any") {
        if (style.part === p.part) {
            points += 7;
            reasons.push("Part placement");
        }
        else
            points -= 3;
    }
    if (p.scalp_visibility === "keep") {
        if ((style.side_grade ?? 1) >= 2) {
            points += 9;
            reasons.push("Relatively less bare short-side guide");
        }
        else {
            points -= 8;
            cautions.push("Grade zero is an illustrative skin-fade guide");
        }
    }
    else if (p.scalp_visibility === "reveal" && (style.side_grade ?? 1) === 0) {
        points += 7;
        reasons.push("Grade zero side guide");
    }
    if (p.prefer_volume) {
        if ((style.top_bias ?? 0) >= 50) {
            points += 13;
            reasons.push("More top emphasis in tonal illustration");
        }
        else
            points -= 6;
    }
    const minutes = maintenance(style);
    if (minutes <= p.maintenance_minutes) {
        points += 12;
        reasons.push("Fits assumed styling-time preference");
    }
    else {
        points -= Math.min(20, Math.floor((minutes - p.maintenance_minutes) / 3) + 3);
        cautions.push("Estimated styling steps may exceed preferred time");
    }
    return { style, score: Math.max(0, Math.min(160, points)), reasons, cautions,
        consultation_version: "r19c/1" };
}
export function findConcepts(styles, p, limit = 12, diversify = true) {
    validateConsultation(p);
    if (!Number.isInteger(limit) || limit < 1 || limit > 48)
        throw Error("Choose 1–48 style concepts.");
    if (styles.length > 2048 || new Set(styles.map((row) => row.id)).size !== styles.length) {
        throw Error("Duplicate or oversized hairstyle catalogue.");
    }
    const ranked = styles.map((item) => scoreStyle(item, p)).sort((a, b) => b.score - a.score ||
        a.style.id.localeCompare(b.style.id));
    if (!diversify)
        return ranked.slice(0, limit);
    const selected = [], familyCount = new Map(), shapeCount = new Map();
    for (const cap of [1, 2, 4, 2048]) {
        for (const item of ranked) {
            if (selected.length >= limit)
                break;
            const shape = item.style.fade_shape ?? "classic";
            if (selected.includes(item) || (familyCount.get(item.style.family) ?? 0) >= cap ||
                (shapeCount.get(shape) ?? 0) >= Math.max(2, cap * 2))
                continue;
            selected.push(item);
            familyCount.set(item.style.family, (familyCount.get(item.style.family) ?? 0) + 1);
            shapeCount.set(shape, (shapeCount.get(shape) ?? 0) + 1);
        }
        if (selected.length >= limit)
            break;
    }
    return selected;
}
export function compareStyles(styles) {
    if (styles.length < 1 || styles.length > 9 || new Set(styles.map((p) => p.id)).size !== styles.length) {
        throw Error("Compare 1–9 different local style references.");
    }
    const tiles = styles.map((style) => ({ id: style.id, name: style.name,
        fade: style.fade, shape: style.fade_shape ?? "classic", side_grade: style.side_grade ?? 1,
        top_grade: style.top_grade ?? 4, length_tag: cutLength(style),
        pattern: style.pattern ?? "plain", family: style.family,
        maintenance_assumption_minutes: maintenance(style), source: "local", simulation: true,
        visual_quality_verified: false }));
    const fields = ["fade", "shape", "side_grade", "top_grade", "length_tag", "pattern", "family"];
    const differences = fields.filter((key) => new Set(tiles.map((tile) => tile[key])).size > 1);
    return { tiles, differences, provider_calls: 0, real_face_tested: false,
        notice: "Concept-board metadata only. Results require masks and human review." };
}
export function stylistBrief(style, p) {
    const fit = scoreStyle(style, p);
    const questions = [
        `Discuss a ${style.fade} fade height and ${style.fade_shape ?? "classic"} short-side guide.`,
        `The local tonal concept uses grades ${style.side_grade ?? 1} to ${style.top_grade ?? 4}.`,
        `Review the ${style.top} top, ${style.part} part, and ${style.pattern ?? "plain"} texture suggestion.`,
        "Ask whether the existing hair, scalp and desired length support the reference.",
        "Request a physical consultation; the app has not generated new strands.",
    ];
    if (p.scalp_visibility === "keep") {
        questions.splice(3, 0, "Discuss how much scalp will remain visible at the shortest areas.");
    }
    if (p.maintenance_minutes < maintenance(style)) {
        questions.splice(4, 0, "Confirm the realistic styling and maintenance time with your stylist.");
    }
    return { style_id: style.id, title: style.name, questions,
        reasons: fit.reasons, cautions: fit.cautions, simulation: true,
        quality_status: "UNPROVEN", photo_required: false, provider_calls: 0,
        notice: "For discussion only; no hairstyle result is guaranteed." };
}
