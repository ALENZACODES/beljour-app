const RAW = [
    [
        "W45",
        "lips",
        "Fuller lips shape control",
        "W45_TEST_ANATOMICAL_CAP",
        "Geometry stays bounded by observed lip anatomy; zero strength is identity; output remains a simulation.",
        "",
        ["locality", "zero_identity", "geometry_cap", "real_face_review"],
    ],
    [
        "W46",
        "lips",
        "Realistic overline",
        "W46_TEST_EDGE_FOLLOW",
        "Guide follows the observed vermilion edge, suppresses corners and limits pixels outside the lip support.",
        "",
        ["locality", "edge_alignment", "daylight_review"],
    ],
    [
        "W47",
        "lips",
        "Lip tint and blush PMU states",
        "W47_TEST_FADE_ORDER",
        "Fresh, healed and fade display states are monotonically weaker and are never described as retention predictions.",
        "",
        ["fade_order", "copy_review", "deep_lip_review"],
    ],
    [
        "W48",
        "lips",
        "Lip flip appearance",
        "W48_TEST_UPPER_LIP_BOUND",
        "Upper-lip appearance shift stays within a conservative geometry cap and makes no treatment claim.",
        "",
        ["geometry_cap", "locality", "copy_review"],
    ],
    [
        "W49",
        "lips",
        "Filler dose-style comparison",
        "W49_TEST_STYLE_NOT_DOSE",
        "Dose wording is a visual style label only; geometry remains capped and no real millilitre-to-outcome mapping is claimed.",
        "",
        ["geometry_cap", "copy_review", "real_face_review"],
    ],
    [
        "W50",
        "smile",
        "Gum-show appearance consultation",
        "W50_TEST_CHECKED_GUM_ONLY",
        "Only checked gum and tooth polygons are used; output is static and contains no diagnosis or treatment recommendation.",
        "region",
        ["annotation_provenance", "locality", "copy_review"],
    ],
    [
        "W51",
        "smile",
        "Veneer design preview",
        "W51_TEST_CHECKED_TEETH_ONLY",
        "Only checked teeth are edited; shape and shade are bounded; no automatic segmentation model or clinical outcome is claimed.",
        "region",
        ["annotation_provenance", "shade_review", "irreversibility_copy"],
    ],
    [
        "W52",
        "smile",
        "Tooth-gap preference preview",
        "W52_TEST_KEEP_FIRST_CLASS",
        "Keep is a first-class option; partial and visual closure are bounded; no beauty score or orthodontic outcome is presented.",
        "region",
        ["annotation_provenance", "midline_check", "copy_review"],
    ],
    [
        "W53",
        "smile",
        "Tooth and gum character",
        "W53_TEST_GUM_GUIDE_DISCLOSURE",
        "Checked gum and teeth drive the guide; tooth character remains editable; surgical context is disclosed without treatment advice.",
        "region",
        ["annotation_provenance", "gum_line_check", "copy_review"],
    ],
    [
        "W54",
        "lips",
        "Optical tooth contrast from lip shade",
        "W54_TEST_TEETH_UNCHANGED",
        "Teeth pixels remain byte-identical; only adjacent lip colour changes perceived contrast.",
        "",
        ["protected_teeth", "locality", "copy_review"],
    ],
    [
        "W55",
        "lips",
        "Lipstick finish",
        "W55_TEST_TEXTURE_RETENTION",
        "Finish changes colour or reflectance while retaining measurable source-lip texture and original alpha.",
        "",
        ["texture_retention", "alpha_identity", "locality"],
    ],
    [
        "W56",
        "lips",
        "Wear-off scenarios",
        "W56_TEST_DETERMINISTIC_WEAR",
        "Same seed and scenario are deterministic; stronger wear does not increase retained colour; no duration promise is made.",
        "",
        ["determinism", "wear_order", "copy_review"],
    ],
    [
        "W57",
        "lips",
        "Pigmentation-aware lip colour",
        "W57_TEST_PIGMENT_PRESERVATION",
        "Opacity adapts to observed lip pigmentation only inside the lip mask and natural variation is not labelled a defect.",
        "",
        ["locality", "pigmentation_review", "copy_review"],
    ],
    [
        "W58",
        "smile",
        "Smile in motion",
        "W58_TEST_CHECKED_FRAME_STABILITY",
        "At least two time-ordered checked frames are required; annotation jumps are bounded; automatic tracking is not claimed.",
        "sequence",
        ["frame_provenance", "temporal_stability", "real_sequence_review"],
    ],
    [
        "W77",
        "skin_more",
        "Sheer skin tint",
        "W77_TEST_TEXTURE_FIRST_TINT",
        "Tint is bounded, zero strength is identity, texture remains visible and no skin-tone ranking or lightening objective is used.",
        "",
        ["texture_retention", "zero_identity", "fairness_slice"],
    ],
    [
        "W78",
        "skin_more",
        "Cosmetic tan",
        "W78_TEST_DRY_ZONE_BOUND",
        "Cosmetic colour is bounded, dry zones receive no more colour than the base mask and no UV or health claim is made.",
        "",
        ["locality", "dry_zone_review", "copy_review"],
    ],
    [
        "W79",
        "skin_more",
        "Face and body tone match",
        "W79_TEST_DELTA_REDUCTION",
        "Checked-region colour distance decreases without changing unmarked pixels or asserting a preferred skin tone.",
        "region",
        ["region_delta", "locality", "fairness_slice"],
    ],
    [
        "W80",
        "skin_more",
        "Visual sunscreen cast",
        "W80_TEST_NO_EFFICACY_CLAIM",
        "Only the checked region receives a visual cast simulation and the output explicitly makes no SPF or UV-efficacy claim.",
        "region",
        ["locality", "cast_order", "copy_review"],
    ],
    [
        "W81",
        "skin_more",
        "Marked pigmentation concealing",
        "W81_TEST_USER_MARKED_ONLY",
        "Only user-marked deeper-pigmentation regions receive bounded corrector; no diagnosis or defect label is generated.",
        "region",
        ["locality", "corrector_bound", "fairness_slice"],
    ],
    [
        "W82",
        "skin_more",
        "Marked redness correction",
        "W82_TEST_NO_DIAGNOSIS",
        "Only user-marked redness appearance is changed; correction is bounded and no medical diagnosis is inferred.",
        "region",
        ["locality", "corrector_bound", "copy_review"],
    ],
    [
        "W83",
        "skin_more",
        "Local cycle-linked appearance diary",
        "W83_TEST_CONSENT_NO_PREDICTION",
        "Explicit local health-data consent is required; entries remain local and the diary does not predict fertility, cycle timing or diagnosis.",
        "health",
        ["consent", "local_storage_review", "copy_review"],
    ],
    [
        "W84",
        "skin_more",
        "Mature-skin texture-first mode",
        "W84_TEST_ZERO_LINE_BLUR",
        "Texture remains measurable, line blur is zero and copy does not promise younger-looking or anti-age outcomes.",
        "",
        ["texture_retention", "line_blur_zero", "copy_review"],
    ],
    [
        "W85",
        "skin_more",
        "Jewellery placement",
        "W85_TEST_CHECKED_PLACEMENT",
        "Procedural jewellery is constrained to checked placement support and does not claim millimetre sizing without calibration.",
        "region",
        ["placement", "locality", "calibration_copy"],
    ],
    [
        "W86",
        "skin_more",
        "Glasses placement",
        "W86_TEST_CHECKED_FRAME_FIT",
        "Procedural frames stay within checked fit support, preserve protected facial regions and avoid uncalibrated physical-size claims.",
        "region",
        ["placement", "symmetry", "protected_regions"],
    ],
    [
        "W87",
        "skin_more",
        "Nail colour",
        "W87_TEST_MANUAL_NAIL_REGION",
        "Only manually checked nail regions receive colour; no automatic hand model is introduced and surrounding pixels stay unchanged.",
        "region",
        ["annotation_provenance", "locality", "alpha_identity"],
    ],
    [
        "W88",
        "skin_more",
        "Hijab colour and drape",
        "W88_TEST_HAIR_PROTECTION",
        "Only checked scarf support is coloured, protected hair remains unchanged and public release remains gated on cultural co-design review.",
        "region cultural",
        ["locality", "hair_protection", "cultural_review"],
    ],
    [
        "W89",
        "skin_more",
        "Occasion bundles",
        "W89_TEST_EDITABLE_BUNDLE",
        "Every bundle is editable into individual controls, uses plain occasion wording and makes no competence or attractiveness claim.",
        "",
        ["editability", "copy_review", "zero_identity"],
    ],
    [
        "W90",
        "skin_more",
        "Freckles",
        "W90_TEST_PRESERVE_FIRST_CLASS",
        "Preserve is exact identity; faux freckles are seeded, bounded to checked support and never erase existing freckles.",
        "region",
        ["preserve_identity", "determinism", "locality"],
    ],
    [
        "W91",
        "skin_more",
        "Face and body continuity",
        "W91_TEST_LIGHTING_CAVEAT",
        "Checked-region continuity reduces mismatch when possible, preserves unmarked pixels and reports the lighting caveat.",
        "region",
        ["region_delta", "locality", "lighting_caveat"],
    ],
    [
        "W92",
        "skin_more",
        "Texture-first mature rendering",
        "W92_TEST_TEXTURE_PRESERVATION",
        "Microcontrast is bounded, measured texture stays above the gate and no wrinkle-removal or age-reversal promise is made.",
        "",
        ["texture_retention", "copy_review", "fairness_slice"],
    ],
];
function hasFlag(flags, flag) {
    return flags.split(/\s+/).includes(flag);
}
export const CONTRACTS = RAW.map((row) => ({
    feature: row[0],
    group: row[1],
    name: row[2],
    testId: row[3],
    passDefinition: row[4],
    requiresCheckedRegion: hasFlag(row[5], "region"),
    requiresCheckedSequence: hasFlag(row[5], "sequence"),
    requiresHealthConsent: hasFlag(row[5], "health"),
    requiresCulturalReview: hasFlag(row[5], "cultural"),
    releaseEvidence: row[6],
}));
const BY_ID = new Map(CONTRACTS.map((row) => [row.feature, row]));
export function contract(feature) {
    const row = BY_ID.get(feature);
    if (!row)
        throw new Error(`unsupported R16 Workstream B feature: ${feature}`);
    return row;
}
export function grouped() {
    return {
        lips: CONTRACTS.filter((row) => row.group === "lips"),
        smile: CONTRACTS.filter((row) => row.group === "smile"),
        skin_more: CONTRACTS.filter((row) => row.group === "skin_more"),
    };
}
export function auditCatalogue() {
    const ids = CONTRACTS.map((row) => row.feature);
    const tests = CONTRACTS.map((row) => row.testId);
    const groups = grouped();
    return {
        rows: CONTRACTS.length,
        uniqueFeatures: new Set(ids).size === ids.length,
        uniqueTestIds: new Set(tests).size === tests.length,
        groups: {
            lips: groups.lips.length,
            smile: groups.smile.length,
            skin_more: groups.skin_more.length,
        },
        checkedRegionRows: CONTRACTS.filter((row) => row.requiresCheckedRegion).length,
        checkedSequenceRows: CONTRACTS.filter((row) => row.requiresCheckedSequence).length,
        healthConsentRows: CONTRACTS.filter((row) => row.requiresHealthConsent).length,
        culturalReviewRows: CONTRACTS.filter((row) => row.requiresCulturalReview).length,
    };
}
export function prerequisites(feature, input = {}) {
    const row = contract(feature);
    const reasons = [];
    if (row.requiresCheckedRegion && (input.checkedRegions ?? 0) < 1)
        reasons.push("checked local region missing");
    if (row.requiresCheckedSequence && (input.checkedFrames ?? 0) < 2)
        reasons.push("two or more checked frames required");
    if (row.requiresHealthConsent && input.healthConsent !== true)
        reasons.push("explicit local health-data consent missing");
    if (row.requiresCulturalReview && input.culturalReview !== true)
        reasons.push("cultural co-design release review pending");
    return { passed: reasons.length === 0, reasons };
}
export function evidenceStatus(feature, evidence) {
    const supplied = new Set(evidence);
    const missing = contract(feature).releaseEvidence.filter((item) => !supplied.has(item));
    return { passed: missing.length === 0, missing };
}
function numberMetric(metrics, key) {
    const value = metrics[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
export function metricGate(feature, metrics) {
    const reasons = [];
    const outside = numberMetric(metrics, "outside_error");
    if (outside === undefined)
        reasons.push("outside_error metric missing");
    else if (outside > 0.03)
        reasons.push("outside_error exceeds 0.03");
    if (metrics.alpha_identity !== true)
        reasons.push("alpha identity not demonstrated");
    if (metrics.zero_identity !== true)
        reasons.push("zero-strength identity not demonstrated");
    if (["W55", "W77", "W84", "W92"].includes(feature)) {
        const texture = numberMetric(metrics, "texture_retention");
        const floor = feature === "W55" ? 0.45 : feature === "W77" ? 0.72 : 0.78;
        if (texture === undefined)
            reasons.push("texture_retention metric missing");
        else if (texture < floor)
            reasons.push(`texture_retention below ${floor.toFixed(2)}`);
    }
    if (feature === "W54" && metrics.protected_teeth_unchanged !== true)
        reasons.push("protected teeth identity not demonstrated");
    if (["W56", "W90"].includes(feature) && metrics.deterministic !== true)
        reasons.push("determinism not demonstrated");
    if (feature === "W58") {
        const frames = numberMetric(metrics, "checked_frames");
        if (frames === undefined || frames < 2)
            reasons.push("checked-frame count below two");
        if (metrics.automatic_tracking !== false)
            reasons.push("automatic-tracking exclusion not demonstrated");
    }
    if (feature === "W83" && metrics.prediction !== false)
        reasons.push("no-prediction property not demonstrated");
    if (feature === "W88" && metrics.protected_hair_unchanged !== true)
        reasons.push("protected hair identity not demonstrated");
    return { passed: reasons.length === 0, reasons };
}
export function evaluate(feature, metrics, tested, input = {}) {
    const row = contract(feature);
    const pre = prerequisites(feature, input);
    const measured = metrics ?? {};
    if (!tested) {
        return {
            feature,
            testId: row.testId,
            status: "not_tested",
            passed: false,
            reasons: [...pre.reasons, "real-face evidence not supplied"],
            metrics: measured,
        };
    }
    if (!pre.passed) {
        return {
            feature,
            testId: row.testId,
            status: "failed",
            passed: false,
            reasons: pre.reasons,
            metrics: measured,
        };
    }
    const gate = metricGate(feature, measured);
    return {
        feature,
        testId: row.testId,
        status: gate.passed ? "passed" : "failed",
        passed: gate.passed,
        reasons: gate.reasons,
        metrics: measured,
    };
}
export function releaseSummary(results) {
    const counts = { passed: 0, failed: 0, not_tested: 0 };
    const groups = {
        lips: { passed: 0, failed: 0, not_tested: 0 },
        smile: { passed: 0, failed: 0, not_tested: 0 },
        skin_more: { passed: 0, failed: 0, not_tested: 0 },
    };
    for (const result of results) {
        counts[result.status] += 1;
        groups[contract(result.feature).group][result.status] += 1;
    }
    const supplied = new Set(results.map((row) => row.feature));
    const missingFeatures = CONTRACTS.map((row) => row.feature).filter((feature) => !supplied.has(feature));
    return {
        counts,
        groups,
        missingFeatures,
        complete: missingFeatures.length === 0,
        releaseReady: missingFeatures.length === 0 && counts.failed === 0 && counts.not_tested === 0,
        note: "Release readiness still depends on the binding frozen-face gate; synthetic tests cannot substitute for it.",
    };
}
