/** Typed catalogue for the six R19B Lane B easy filters. Author: John Khan. */
import { LABEL as BRIDAL_LABEL } from "./bridal.js";
import { LABEL as EYE_LABEL } from "./eye-colour.js";
import { LABEL as FUN_LABEL } from "./fun.js";
import { LABEL as GLASSES_LABEL } from "./glasses.js";
import { LABEL as RETRO_LABEL } from "./retro.js";
import { LABEL as SUMMER_LABEL } from "./summer.js";
export const FILTERS = [
    {
        filterId: "playful_paws",
        gapRow: 14,
        name: "Playful Paws",
        label: FUN_LABEL,
        provider: "local",
        adultOnly: true,
        identityPolicy: "preserve_iris_and_marks",
        requiredInputs: ["left_eye", "right_eye", "nose", "mouth", "mouth_open"],
        scopeNote: "Still-photo original artwork only; tongue is conditional on mouth openness.",
    },
    {
        filterId: "archive_flash",
        gapRow: 20,
        name: "Archive Flash",
        label: RETRO_LABEL,
        provider: "local",
        adultOnly: true,
        identityPolicy: "preserve_iris_and_marks",
        requiredInputs: ["photo", "optional_background_mask"],
        scopeNote: "Photo treatment only: no generated clothing or branded yearbook template.",
    },
    {
        filterId: "iris_tint",
        gapRow: 25,
        name: "Iris Tint",
        label: EYE_LABEL,
        provider: "local",
        adultOnly: true,
        identityPolicy: "change_iris_preserve_marks",
        requiredInputs: ["iris_mask", "pupil_mask", "highlight_mask"],
        scopeNote: "Local iris colour only; pupil, limbal edge treatment and highlight remain protected.",
    },
    {
        filterId: "atelier_frames",
        gapRow: 26,
        name: "Atelier Frames",
        label: GLASSES_LABEL,
        provider: "local",
        adultOnly: true,
        identityPolicy: "preserve_iris_and_marks",
        requiredInputs: ["left_eye", "right_eye"],
        scopeNote: "Front-view v1 with original procedural frame geometry; no brand frames or logos.",
    },
    {
        filterId: "sunlit_skin",
        gapRow: 27,
        name: "Sunlit Skin",
        label: SUMMER_LABEL,
        provider: "local",
        adultOnly: true,
        identityPolicy: "preserve_iris_and_marks",
        requiredInputs: ["skin_mask", "undertone", "optional_cheek_nose_mask"],
        scopeNote: "Additive warmth only by default; no tan-removal or skin-lightening control.",
    },
    {
        filterId: "ceremony_light_check",
        gapRow: 30,
        name: "Ceremony Light Check",
        label: BRIDAL_LABEL,
        provider: "local",
        adultOnly: true,
        identityPolicy: "preserve_iris_and_marks",
        requiredInputs: ["skin_mask", "lip_mask", "eye_makeup_mask", "cheek_mask"],
        scopeNote: "Local makeup plus daylight, venue and camera-flash drift report; no gown generation.",
    },
];
export const SKIPPED = [
    {
        gapRow: 4,
        name: "Closed-mouth smile with eye crinkle",
        reason: "Already shipped in Lane A EASY-filter scope.",
        owner: "A",
    },
    {
        gapRow: 28,
        name: "Warm teeth whitening",
        reason: "Already shipped in Lane A EASY-filter scope.",
        owner: "A",
    },
];
export function byId(filterId) {
    const found = FILTERS.find(item => item.filterId === filterId);
    if (!found)
        throw new Error(`unknown R19B filter ${filterId}`);
    return found;
}
export function byGapRow(gapRow) {
    const found = FILTERS.find(item => item.gapRow === gapRow);
    if (!found)
        throw new Error(`gap row ${gapRow} is not built by Lane B r19b`);
    return found;
}
export function validateCatalogue() {
    const problems = [];
    const ids = FILTERS.map(item => item.filterId);
    const rows = FILTERS.map(item => item.gapRow);
    const names = FILTERS.map(item => item.name);
    if (new Set(ids).size !== ids.length)
        problems.push("duplicate filter id");
    if (new Set(rows).size !== rows.length)
        problems.push("duplicate gap row");
    if (new Set(names).size !== names.length)
        problems.push("duplicate filter name");
    if (rows.slice().sort((a, b) => a - b).join(",") !== "14,20,25,26,27,30") {
        problems.push("built gap rows differ from the approved R19B six");
    }
    if (SKIPPED.map(item => item.gapRow).sort((a, b) => a - b).join(",") !== "4,28") {
        problems.push("skip rows must be exactly 4 and 28");
    }
    const approvedNames = [
        "Playful Paws", "Archive Flash", "Iris Tint", "Atelier Frames", "Sunlit Skin", "Ceremony Light Check",
    ];
    if (names.slice().sort().join("|") !== approvedNames.slice().sort().join("|")) {
        problems.push("filter names differ from the approved original-name set");
    }
    for (const spec of FILTERS) {
        if (spec.provider !== "local")
            problems.push(`${spec.filterId}: provider must stay local`);
        if (!spec.adultOnly)
            problems.push(`${spec.filterId}: adults-only flag missing`);
        if (spec.label.includes("\n"))
            problems.push(`${spec.filterId}: label must be one line`);
    }
    return problems;
}
//# sourceMappingURL=catalogue.js.map