/** Feature-specific R17B makeup planners for the browser. Author: John Khan. */
import { compatibility } from "./colour.js";
import { oxidationCurve, seasonalMix } from "./oxidation.js";
import { recommend } from "./palette.js";
function spec(feature, title, controls, outputs, caveats, metrics) {
    return { feature, title, controls, outputs, caveats, metrics };
}
function genericSteps(name) {
    const table = {
        gallery_glow: [
            "Even only where needed.",
            "Soft cheek colour high on the cheek.",
            "Satin lip and restrained eye definition.",
        ],
        midnight_line: [
            "Keep complexion natural.",
            "Define the lash line with a soft charcoal tone.",
            "Use a muted lip with a clean edge.",
        ],
        soft_flash: [
            "Use a thin skin tint.",
            "Add warm cheek colour and controlled highlight.",
            "Choose a satin lip that reads under flash.",
        ],
        velvet_evening: [
            "Keep skin depth unchanged.",
            "Use plum-brown eye colour close to the lash line.",
            "Finish with a deeper muted lip.",
        ],
    };
    return table[name];
}
export function planMakeupFeature(options) {
    switch (options.feature) {
        case "W1":
            return {
                spec: spec("W1", "Custom Palette Builder", ["shade", "accent", "undertone"], ["personal_palette"], ["digital colour is not a product swatch"], ["deep_skin_guard", "palette_roundtrip"]),
                values: {
                    palette: [options.shade, options.accent].map((rgb, index) => ({
                        rgb,
                        role: index === 0 ? "primary" : "accent",
                        undertone_score: compatibility(rgb, options.undertone),
                        source: "user",
                    })),
                },
            };
        case "W2":
            return {
                spec: spec("W2", "Palette Extraction From Any Photo", ["checked_region"], ["local_palette"], ["source photo remains local", "lighting affects extracted colour"], ["deterministic_palette", "no_network"]),
                values: { count: 6, seed: options.seed },
            };
        case "W4": {
            const candidates = [
                options.shade,
                options.accent,
                [96, 54, 82],
                [166, 95, 72],
                [115, 86, 54],
            ];
            return {
                spec: spec("W4", "Undertone-Based Palette Recommendations", ["undertone"], ["ranked_palette"], ["undertone is an appearance estimate", "olive is preserved as a first-class option"], ["undertone_score", "deep_skin_guard"]),
                values: { recommendations: recommend(candidates, options.undertone) },
            };
        }
        case "W5":
            return {
                spec: spec("W5", "Palette For An Outfit", ["outfit_colour", "undertone"], ["harmonies"], ["harmony is a colour suggestion, not a rule"], ["local_colour_math", "no_network"]),
                values: { base_colour: options.accent, undertone: options.undertone },
            };
        case "W7":
            return {
                spec: spec("W7", "Concealer Shade + Placement Maps", ["shade", "face_shape", "undertone"], ["placement_map", "shade_guard"], ["never lighten skin to force a match"], ["mean_luminance_shift", "deep_chroma_ratio", "outside_error"]),
                values: { shade: options.shade, face_shape: options.face_shape },
            };
        case "W8":
            return {
                spec: spec("W8", "Colour Correction Maps", ["issue", "skin_depth", "undertone"], ["corrector", "placement_map"], ["cosmetic appearance only", "no diagnosis"], ["outside_error", "deep_skin_guard", "label_present"]),
                values: {
                    issue: typeof options.metadata.issue === "string" ? options.metadata.issue : "redness",
                    undertone: options.undertone,
                },
            };
        case "W9":
            return {
                spec: spec("W9", "Cream vs Powder Finish Simulator", ["finish", "amount"], ["texture_finish"], ["does not claim wear time or product chemistry"], ["texture_variance_ratio", "deep_skin_guard"]),
                values: { finish: options.finish === "powder" ? "powder" : "cream" },
            };
        case "W10":
            return {
                spec: spec("W10", "Finish Switcher", ["finish", "amount"], ["dewy_matte_skin_tint"], ["skin depth and texture remain visible"], ["highlight_share", "texture_ratio", "deep_skin_guard"]),
                values: { finish: options.finish },
            };
        case "W11":
            return {
                spec: spec("W11", "Blush Placement By Face Shape", ["face_shape", "accent"], ["placement_map"], ["face shape is a geometry hint, not a beauty ranking"], ["outside_error", "symmetry_error", "no_geometry_change"]),
                values: { face_shape: options.face_shape, colour: options.accent },
            };
        case "W12":
            return {
                spec: spec("W12", "Bronzer / Contour Maps Per Face Shape", ["face_shape", "shade"], ["placement_map"], ["no face slimming or reshaping"], ["identity_pins", "outside_error", "deep_skin_guard"]),
                values: { face_shape: options.face_shape, geometry_change: false },
            };
        case "W13":
            return {
                spec: spec("W13", "Reference Photo Makeup Recreator", ["checked_eye", "checked_cheek", "checked_lip"], ["local_reference_recipe"], ["requires user-checked regions", "no automatic face parser", "source lighting affects colour"], ["checked_region_complete", "outside_error", "no_network"]),
                values: { reference_source: "user_checked", automatic_face_parsing: false },
            };
        case "W14":
            return {
                spec: spec("W14", "Original Event Look Recreator", ["look", "amount"], ["step_by_step_recipe"], ["generic original looks only", "no celebrity names or likenesses"], ["brand_name_scan", "outside_error", "deep_skin_guard"]),
                values: { look: options.look, steps: genericSteps(options.look) },
            };
        case "W16":
            return {
                spec: spec("W16", "No-Makeup Makeup Calibrator", ["amount", "shade", "accent"], ["minimal_recipe"], ["minimum product is a preference, not a requirement"], ["changed_fraction", "texture_ratio", "deep_skin_guard"]),
                values: { maximum_layers: 3, maximum_opacity: Math.min(options.amount, 0.35) },
            };
        case "W17":
            return {
                spec: spec("W17", "Foundation Oxidation Simulator", ["oxidation_delta"], ["hourly_estimate"], ["user-entered formula behaviour only", "not a product promise"], ["timeline_monotone", "estimate_label"]),
                values: { timeline: oxidationCurve(options.oxidation_delta) },
            };
        case "W18":
            return {
                spec: spec("W18", "Seasonal Shade Rematch + Mixing Ratio", ["season_shift", "undertone"], ["mix_ratio"], ["mixing ratio is an estimate", "verify on skin"], ["ratio_sum", "deep_skin_guard", "estimate_label"]),
                values: { mix: seasonalMix(options.season_shift) },
            };
    }
}
//# sourceMappingURL=features.js.map