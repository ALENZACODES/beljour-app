const has = (k) => (m) => typeof m[k] === "number" && m[k] > 0;
export const GATES = {
    "full-beard": [
        { key: "texture_sd_ratio", min: 0.9, max: 1.1, why: "pore-band amplitude matches own cheek skin" },
        { key: "texture_kurtosis_ratio", min: 0.75, max: 1.35, why: "pores stay sparse (not Gaussian grain)" },
        { key: "follicle_nn_cv", min: 0.06, max: 0.35, when: has("follicles"), why: "follicles blue-noise: not a grid, not clumps" },
        { key: "jaw_tuck_min_jacobian", min: 0.3, why: "jaw tuck is fold-free" },
        { key: "beard_jaw_pass", equals: true, why: "jaw moved inward only, within beard thickness (beardJawCheck)" },
    ],
    gender: [
        { key: "sd_reached", equals: true, why: "measured progress reached the level's SD target" },
        { key: "shading_max_ratio_delta", max: 0.3, why: "relief shading stays photographic" },
        { key: "min_jacobian", min: 0.05, why: "warp is fold-free" },
    ],
    posture: [
        { key: "seam_audit_pass", equals: true, why: "no ghost, stair steps or halo" },
        { key: "ghost_score", max: 1.6, why: "old outline edge energy at background level" },
        { key: "edge_roughness_px", max: 0.3, why: "no stair-stepped silhouette" },
        { key: "halo_step_l", max: 2.5, abs: true, why: "no light/dark rim" },
    ],
    illustration: [
        { key: "specks_left", max: 0, why: "no ink specks" },
        { key: "blotches", max: 2, why: "no dark smudges" },
        { key: "line_share", min: 0.005, max: 0.2, why: "lines present but not dominant" },
    ],
    freckles: [
        { key: "min_gap_ratio", min: 1.1, why: "no two freckles merge" },
        { key: "median_diam_iod", min: 0.007, max: 0.022, why: "freckle size in the natural range" },
        { key: "pheo_sd", min: 0.05, why: "hue varies freckle to freckle" },
        { key: "depth_sd_l", min: 0.8, why: "depth varies freckle to freckle" },
        // Pigment multiplies linear light, and L* is steeper in darker tones, so own pores read ~10-15% stronger inside a
        // freckle. Above 1.2 would mean texture was added, not kept.
        { key: "pore_keep_inside", min: 0.8, max: 1.2, when: has("interior_px"), why: "pores run through freckles" },
        { key: "clark_evans", min: 1.0, max: 1.3, why: "bunched (R < 1) or stamped grid (R > 1.3)" },
    ],
    tan: [
        { key: "hue_shift_deg", max: 6, why: "stays in the person's hue band (no orange)" },
        { key: "chroma_rise", max: 0.3, why: "no saturation jump" },
        { key: "face_neck_step_l", max: 1.5, when: (m) => typeof m.face_neck_step_l === "number", why: "face and neck move together" },
        { key: "skin_coverage_verified", equals: true, why: "hairline/ears/neck coverage verified by a parsing mask" },
    ],
    older: [
        { key: "crease_energy_ratio", min: 1.2, why: "visibly older lines" },
        { key: "pore_band_ratio", min: 0.95, max: 1.15, why: "1 px band is the person's own" },
        { key: "forehead_spacing_cv", min: 0.1, when: has("forehead_spacing_cv"), why: "forehead lines not ruled parallels" },
        { key: "marks_kept", min: 0.9, why: "moles/freckles kept" },
    ],
    younger: [
        { key: "pore_band_ratio", min: 0.98, max: 1.05, why: "pores and grain untouched" },
        { key: "crease_energy_ratio", max: 0.85, why: "lines visibly softer" },
        { key: "marks_kept", min: 0.9, why: "moles/freckles kept" },
    ],
    teeth: [
        { key: "shading_range_ratio", min: 0.85, max: 1.15, why: "gum-to-tip and tooth-to-tooth shading kept" },
        { key: "translucency_kept", min: 0.6, why: "incisal translucency kept" },
        { key: "max_l_after", max: 92, why: "never paper-white" },
        { key: "min_b_after", min: -1.5, why: "never blue" },
        { key: "edge_step_l", max: 3, abs: true, why: "no hard selection edge" },
    ],
    "hair-fibres": [
        { key: "covered_scalp", min: 0.55, max: 0.9, when: (m) => m.status === "applied", why: "15-30% of scalp still shows at 50" },
        { key: "flow_coherence_in_gap", min: 0.3, when: (m) => m.status === "applied", why: "fibres follow the hair's flow" },
    ],
    balayage: [
        { key: "root_max", max: 0.02, why: "roots untouched" },
        { key: "painted_share", min: 0.08, max: 0.45, why: "ribbons, not a tint" },
        { key: "width_growth", min: 1.3, why: "ribbons widen toward the ends" },
        { key: "log_contrast_kept", min: 0.85, max: 1.25, why: "strand light/shadow kept" },
        { key: "ribbon_lift_sd", min: 0.05, why: "hand-painted variation between ribbons" },
    ],
};
/** Desktop budget from the brief; phone factor ASSUMED (mid-range Android, single-thread JS) until measured. */
export const BUDGET = { desktopMs: 1000, phoneFactor: 3.5, phoneMs: 4000 };
export function shipGate(tool, metrics, identity, human = {}) {
    const failures = [], unknown = [];
    for (const c of GATES[tool]) {
        if (c.when && !c.when(metrics))
            continue;
        const v = metrics[c.key];
        if (c.equals !== undefined) {
            if (v === undefined)
                unknown.push(`${c.key} missing (${c.why})`);
            else if (v !== c.equals)
                failures.push(`${c.key}=${String(v)}: ${c.why}`);
            continue;
        }
        if (typeof v !== "number" || !Number.isFinite(v)) {
            unknown.push(`${c.key} missing (${c.why})`);
            continue;
        }
        const x = c.abs ? Math.abs(v) : v;
        if (c.min !== undefined && x < c.min)
            failures.push(`${c.key} ${x.toFixed(3)} < ${c.min}: ${c.why}`);
        if (c.max !== undefined && x > c.max)
            failures.push(`${c.key} ${x.toFixed(3)} > ${c.max}: ${c.why}`);
    }
    const ms = typeof metrics.render_ms === "number" ? metrics.render_ms : null;
    if (ms === null)
        unknown.push("render_ms missing");
    else if (ms > BUDGET.desktopMs)
        failures.push(`render ${ms.toFixed(0)} ms > ${BUDGET.desktopMs} ms desktop budget`);
    const phone = ms === null ? null : ms * BUDGET.phoneFactor;
    if (phone !== null && phone > BUDGET.phoneMs)
        failures.push(`phone estimate ${phone.toFixed(0)} ms > ${BUDGET.phoneMs} ms (factor ${BUDGET.phoneFactor}, ASSUMED)`);
    if (tool !== "illustration") {
        if (!identity)
            unknown.push("identity not checked");
        else {
            failures.push(...identity.failures.map((f) => `identity: ${f}`));
            unknown.push(...identity.unknown.map((u) => `identity: ${u}`));
        }
    }
    if (human.review100 === false || human.review200 === false || human.blindAtChance === false)
        failures.push("human review failed");
    if (human.review200 === undefined)
        unknown.push("200% visual review not recorded");
    if (human.blindAtChance === undefined)
        unknown.push("blind review not recorded");
    const status = failures.length ? "FAIL" : unknown.length ? "UNKNOWN" : "PASS";
    return { tool, status, failures, unknown, phoneEstimateMs: phone, exportAllowed: status === "PASS" };
}
