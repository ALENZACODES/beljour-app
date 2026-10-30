import { greyTransition, humidityForecast, postpartumRegrowth } from "./timeline.js";
function spec(feature, title, controls, outputs, caveats, metrics) {
    return { feature, title, controls, outputs, caveats, metrics };
}
function faceHeight(g) {
    return Math.abs(g.chin[1] - g.crown[1]);
}
function faceWidth(g) {
    return Math.abs(g.right_temple[0] - g.left_temple[0]);
}
function lengthEstimate(height, requested, curl) {
    const stretch = Math.max(0, Math.min(requested, 1));
    const curlValue = Math.max(0, Math.min(curl, 1));
    const shrinkage = 0.06 + 0.34 * curlValue;
    return {
        stretched_ratio: stretch,
        worn_ratio: stretch * (1 - shrinkage),
        shrinkage_ratio: shrinkage,
        added_pixels: Math.round(height * stretch * (1 - shrinkage) * 0.35),
        label: "visual estimate; stretched and worn lengths are shown separately",
    };
}
function attachmentRows(g, method, count) {
    const n = Math.max(2, Math.min(Math.trunc(count), 8));
    const top = g.crown[1] + faceHeight(g) * (method === "clip" ? 0.12 : 0.16);
    const spacing = faceHeight(g) * (method === "sew" ? 0.26 : 0.22) / Math.max(n - 1, 1);
    return Array.from({ length: n }, (_, index) => ({
        y: top + index * spacing,
        width: Math.min(faceWidth(g) * (0.45 + 0.08 * index), faceWidth(g) * 0.82),
    }));
}
function topperProfile(g, volume) {
    const v = Math.max(0, Math.min(volume, 1));
    return {
        crown_x: g.crown[0],
        crown_y: g.crown[1],
        base_width_ratio: faceWidth(g) * (0.42 + 0.22 * v),
        base_height_ratio: faceHeight(g) * (0.16 + 0.10 * v),
        lift_ratio: 0.03 + 0.08 * v,
        label: "topper volume simulation",
    };
}
function wigProfile(g, amount, sensitive) {
    const a = Math.max(0, Math.min(amount, 1));
    return {
        cap_width_ratio: faceWidth(g) * (0.93 + 0.04 * a),
        cap_depth_ratio: faceHeight(g) * (0.44 + 0.07 * a),
        hairline_softness: sensitive ? 0.75 : 0.55,
        scalp_contact_visualization: sensitive,
        label: "fashion wig preview; fit and comfort need physical verification",
    };
}
function haircutOptions(g, curlStrength) {
    const ratio = faceHeight(g) / Math.max(faceWidth(g), 1e-6);
    const shrinkage = 0.06 + 0.30 * Math.max(0, Math.min(curlStrength, 1));
    const names = ratio > 1.55
        ? ["collarbone layers", "rounded shoulder cut", "soft chin frame"]
        : ratio < 1.30
            ? ["long vertical layers", "shoulder sweep", "face-frame layers"]
            : ["soft layers", "collarbone shape", "balanced face frame"];
    const lengths = [0.74, 0.62, 0.52];
    return names.map((name, index) => ({
        name,
        worn_length_ratio: lengths[index] * (1 - shrinkage),
        texture_retention: 0.95,
        note: "geometry-informed preview, not a beauty rule",
    }));
}
function fringeOptions(g) {
    const longFace = faceHeight(g) / Math.max(faceWidth(g), 1e-6) > 1.55;
    return [
        { name: "soft curtain", fringe_ratio: longFace ? 0.22 : 0.18, texture_retention: 0.95 },
        { name: "side sweep", fringe_ratio: 0.16, texture_retention: 0.96 },
        { name: "light fringe", fringe_ratio: longFace ? 0.25 : 0.20, texture_retention: 0.92 },
    ];
}
export function planHairFeature(options, geometry, imageHeight) {
    switch (options.feature) {
        case "W19":
            return {
                spec: spec("W19", "Clip-In Extensions Preview", ["length_ratio", "volume", "curl_strength"], ["stretched_length", "worn_length", "blend"], ["worn length varies with curl and shrinkage", "fit requires physical product"], ["outside_error", "texture_ratio", "blend_score"]),
                values: {
                    length: lengthEstimate(imageHeight, options.length_ratio, options.curl_strength),
                    attachments: attachmentRows(geometry, "clip", 4),
                },
            };
        case "W20": {
            const method = options.volume >= 0.5 ? "sew" : "tape";
            return {
                spec: spec("W20", "Tape-In / Sew-In Extensions Preview", ["length_ratio", "volume", "curl_strength"], ["attachment_rows", "worn_length"], ["installation method is illustrative", "tension and scalp suitability need a professional"], ["outside_error", "texture_ratio", "row_spacing"]),
                values: {
                    method,
                    length: lengthEstimate(imageHeight, options.length_ratio, options.curl_strength),
                    attachments: attachmentRows(geometry, method, 5),
                },
            };
        }
        case "W21":
            return {
                spec: spec("W21", "Hair Topper Preview", ["volume", "colour"], ["crown_base", "lift"], ["fit and attachment security are not predicted"], ["outside_error", "crown_coverage", "texture_ratio"]),
                values: { profile: topperProfile(geometry, options.volume) },
            };
        case "W22":
            return {
                spec: spec("W22", "Fashion Wig Preview", ["volume", "colour", "scalp_sensitivity"], ["cap_extent", "hairline_softness"], ["fashion preview only", "comfort and cap fit require in-person verification"], ["outside_error", "hairline_overlap", "texture_ratio"]),
                values: { profile: wigProfile(geometry, options.amount, options.scalp_sensitivity) },
            };
        case "W23":
            return {
                spec: spec("W23", "Root Touch-Up Preview", ["colour", "amount"], ["root_band"], ["temporary cosmetic appearance only"], ["outside_error", "root_colour_delta", "texture_ratio"]),
                values: { opacity: options.amount * 0.55, preserve_luma: 0.95 },
            };
        case "W24": {
            const cap = options.scalp_sensitivity ? 0.35 : 0.55;
            return {
                spec: spec("W24", "Hairline Filler + Scalp Concealer", ["colour", "amount", "scalp_sensitivity"], ["hairline_band", "scalp_blend"], ["density is a photo appearance estimate", "not a diagnosis"], ["outside_error", "scalp_delta", "edge_continuity"]),
                values: { effective_opacity: Math.min(options.amount, cap), concept_import: "engines/concealer" },
            };
        }
        case "W25":
            return {
                spec: spec("W25", "Density Fibres Simulation", ["volume", "colour", "seed"], ["procedural_fibres", "coverage_estimate"], ["does not predict hair growth", "fibre adhesion not simulated"], ["outside_error", "strand_density", "texture_ratio"]),
                values: { strand_density: 0.15 + options.volume * 0.70, seed: options.seed },
            };
        case "W26":
            return {
                spec: spec("W26", "Semi-Permanent Tint Preview", ["colour", "amount"], ["tint"], ["actual porosity and starting colour alter results"], ["outside_error", "texture_ratio", "chroma_energy"]),
                values: { opacity: options.amount * 0.65, preserve_luma: 0.82 },
            };
        case "W29":
            return {
                spec: spec("W29", "Money Piece Preview", ["accent", "amount"], ["face_frame_map"], ["placement is an artistic guide"], ["outside_error", "placement_centroid", "texture_ratio"]),
                values: { stripe_count: 4, phase: 0.15 },
            };
        case "W30":
            return {
                spec: spec("W30", "Lowlights / Babylights / Foil Maps", ["accent", "volume"], ["foil_map", "section_count"], ["map is a consultation guide, not installation instruction"], ["outside_error", "placement_coverage", "section_spacing"]),
                values: { stripe_count: Math.round(8 + options.volume * 12), phase: 0 },
            };
        case "W31":
            return {
                spec: spec("W31", "Chunky Highlights + Lived-In Colour", ["accent", "amount", "volume"], ["chunk_map", "root_fade"], ["placement is illustrative"], ["outside_error", "root_fade_monotonicity", "texture_ratio"]),
                values: {
                    chunkiness: 0.35 + options.volume * 0.55,
                    root_softness: 0.10 + options.amount * 0.12,
                },
            };
        case "W32":
            return {
                spec: spec("W32", "Grey Blending Preview", ["grey_share", "amount"], ["blended_grey"], ["observed grey is a photo estimate", "neutral choice framing"], ["outside_error", "grey_share", "root_contrast"]),
                values: {
                    requested_share: options.grey_share,
                    neutral_copy: ["blend grey", "keep current colour", "grow natural grey"],
                },
            };
        case "W33": {
            const timeline = greyTransition(options.grey_share, 18);
            return {
                spec: spec("W33", "Grey Transition Timeline", ["grey_share", "month"], ["month_by_month_share", "estimated_regrowth"], ["timeline is illustrative", "continue colouring and grow-out are shown neutrally"], ["monotone_natural_share", "root_contrast", "outside_error"]),
                values: { timeline, selected: timeline[Math.min(options.month, 18)] },
            };
        }
        case "W34":
            return {
                spec: spec("W34", "Colour Melt / Ombré", ["accent", "amount"], ["vertical_melt"], ["actual lift and porosity are not predicted"], ["outside_error", "blend_smoothness", "texture_ratio"]),
                values: {
                    start_ratio: 0.46 + 0.08 * (1 - options.amount),
                    softness: 0.14 + 0.08 * options.amount,
                },
            };
        case "W35":
            return {
                spec: spec("W35", "Split Dye", ["colour", "accent", "amount"], ["left_right_partition"], ["part location is an editable visual guide"], ["outside_error", "split_balance", "texture_ratio"]),
                values: { split: 0.5, feather: 0.012 },
            };
        case "W36":
            return {
                spec: spec("W36", "Peekaboo Colour", ["accent", "amount", "seed"], ["hidden_colour_region"], ["placement depends on styling and movement"], ["outside_error", "hidden_region_share", "texture_ratio"]),
                values: { side: options.seed % 2 ? "right" : "left", depth_start: 0.48 },
            };
        case "W37":
            return {
                spec: spec("W37", "Bangs / Fringe Previews", ["amount", "curl_strength"], ["fringe_geometry", "worn_length"], ["hairline and density can change the real cut"], ["outside_error", "fringe_overlap", "texture_ratio"]),
                values: { options: fringeOptions(geometry) },
            };
        case "W38":
            return {
                spec: spec("W38", "Haircut Previews By Face Shape", ["curl_strength", "length_ratio"], ["cut_options"], ["face shape is a geometry proxy, not a beauty ranking"], ["identity_geometry_unchanged", "texture_ratio", "outside_error"]),
                values: { options: haircutOptions(geometry, options.curl_strength) },
            };
        case "W40":
            return {
                spec: spec("W40", "Frizz Control + Curl Definition", ["amount", "curl_strength"], ["detail_definition"], ["does not claim chemical or weather protection"], ["curl_frequency_delta", "texture_ratio", "outside_error"]),
                values: { definition_amount: options.amount, minimum_texture_ratio: 0.80 },
            };
        case "W41":
            return {
                spec: spec("W41", "Postpartum Regrowth Simulation", ["month", "amount"], ["estimated_density", "estimated_length"], ["not medical advice", "not a growth prediction", "consult a clinician for health concerns"], ["outside_error", "density_monotonicity", "label_present"]),
                values: { regrowth: postpartumRegrowth(options.month, options.amount) },
            };
        case "W42":
            return {
                spec: spec("W42", "Chemo-Sensitive Wig + Scalp Tools", ["amount", "colour", "scalp_sensitivity"], ["gentle_wig_profile", "scalp_contact_guide"], ["optional visual aid", "not medical advice", "comfort takes priority over coverage"], ["outside_error", "scalp_delta", "copy_safety"]),
                values: {
                    profile: wigProfile(geometry, Math.min(options.amount, 0.45), true),
                    maximum_opacity: Math.min(options.amount, 0.35),
                    maximum_scalp_contact: Math.min(0.25, 0.10 + 0.18 * options.amount),
                },
            };
        case "W43": {
            const style = typeof options.metadata === "object" && options.metadata !== null && "heat_style" in options.metadata
                ? String(options.metadata.heat_style)
                : "wave";
            const allowed = ["straight", "wave", "curl", "blowout"];
            if (!allowed.includes(style))
                throw new RangeError("unsupported heat style");
            const displacement = { straight: 0.18, wave: 0.10, curl: 0.08, blowout: 0.12 }[style] * options.heat_shape;
            return {
                spec: spec("W43", "Heat Styling Previews", ["heat_shape", "curl_strength", "heat_style"], ["style_profile"], ["preview is not a heat-temperature recommendation"], ["texture_retention", "outside_error", "alpha_error"]),
                values: {
                    style,
                    shape_amount: options.heat_shape,
                    texture_retention_target: Math.max(0.72, 1 - displacement * (0.6 + 0.4 * options.curl_strength)),
                },
            };
        }
        case "W44":
            return {
                spec: spec("W44", "Humidity-Proof Hair Forecast", ["humidity", "curl_strength"], ["frizz_risk", "definition_retention"], ["estimate from user-entered humidity", "product efficacy is not predicted"], ["forecast_bounds", "label_present", "curl_pattern_retained"]),
                values: { forecast: humidityForecast(options.humidity, options.curl_strength) },
            };
    }
}
//# sourceMappingURL=features.js.map