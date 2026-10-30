/** Hair Studio 2x2 / 3x3 variants: planning board, never imaginary results.
 * Each cell says whether an image has actually been rendered. A recorded S2 result
 * is the same *one* synthetic replay and cannot be labelled a new variant.
 * Author: John Khan.
 */
import { DEFAULT_HAIR_STRENGTH, clampStrength, styleById } from "./model.js";
const ADJUNCTS = ["bangs", "curl", "extension", "volume"];
export function positiveAdjuncts(value) {
    const raw = value ?? {};
    for (const key of Object.keys(raw))
        if (!ADJUNCTS.includes(key))
            throw new RangeError(`Unknown styling option ${key}`);
    return ADJUNCTS.filter((key) => raw[key] !== undefined && clampStrength(raw[key]) > 0);
}
export function estimateHairUnits(base, modifiers) {
    if (!Number.isInteger(base) || base < 1 || base > 100)
        throw new RangeError("Invalid provisional unit cost");
    let units = base;
    for (const adjunct of modifiers)
        units += adjunct === "volume" ? 2 : 1;
    return units;
}
function slotFrom(style, index, options, strength, modifiers) {
    const isSeed = style.source === "synthetic-s1";
    const verified = isSeed && !!style.template_id && (options.verified?.has(style.template_id) ?? false);
    const ready = !!options.liveMode && verified;
    const state = ready ? "ready" : isSeed ? "synthetic-demo" : "inspiration";
    const reason = ready
        ? "A verified template candidate. Quote and consent are required for each request."
        : isSeed ? "S1 synthetic item, not a verified haircut. See the separate sample result."
            : "Cut inspiration only. No verified template or result image.";
    return { slot: index, styleId: style.id, title: style.name, state,
        reason, templateId: isSeed ? style.template_id : null, strength, modifiers,
        estimatedUnits: ready ? estimateHairUnits(2, modifiers) : null,
        resultUrl: null, provenance: "none" };
}
export function variants(options) {
    if (options.gridSize !== 4 && options.gridSize !== 9)
        throw new RangeError("Choose 2x2 or 3x3");
    const strength = clampStrength(options.strength ?? DEFAULT_HAIR_STRENGTH);
    const modifiers = positiveAdjuncts(options.modifiers);
    const ids = [...new Set(options.selected)];
    const tiles = [];
    for (let index = 0; index < options.gridSize; index++) {
        const row = index < ids.length ? styleById(ids[index]) : null;
        if (row)
            tiles.push(slotFrom(row, index, options, strength, modifiers));
        else
            tiles.push({ slot: index, styleId: "", title: "Choose a haircut", state: "empty",
                reason: "Select a style from the catalogue to fill this cell.", templateId: null,
                strength, modifiers: [], estimatedUnits: null, resultUrl: null, provenance: "none" });
    }
    return { size: options.gridSize, tiles, ready: tiles.filter((t) => t.state === "ready").length,
        unrendered: tiles.filter((t) => !t.resultUrl).length,
        labelled: tiles.filter((t) => t.reason.length > 0).length };
}
/** A real result can only be attached to the exact cell that created it. */
export function withResult(board, slot, url, provenance) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= board.size)
        throw new RangeError("Unknown variant slot");
    if (!url.startsWith("data:image/") && !url.startsWith("hair-assets/"))
        throw new RangeError("Unexpected result URL");
    if (provenance === "synthetic" && !url.startsWith("hair-assets/"))
        throw new RangeError("A synthetic result must use a bundled sample");
    if (provenance === "youcam" && !url.startsWith("data:image/"))
        throw new RangeError("Only validated result image data may be displayed");
    const old = board.tiles[slot];
    if (old.state === "empty" || old.state === "inspiration")
        throw new Error("A cut idea cannot be relabelled as a provider result");
    const tiles = board.tiles.map((item, n) => n !== slot ? item : { ...item, resultUrl: url,
        state: provenance === "synthetic" ? "synthetic-demo" : "ready",
        provenance, reason: provenance === "synthetic" ? "Illustrated synthetic S2 example; not a YouCam output."
            : "Result of an approved YouCam styling request." });
    return { size: board.size, tiles, ready: tiles.filter((x) => x.state === "ready").length,
        unrendered: tiles.filter((x) => !x.resultUrl).length,
        labelled: tiles.length };
}
export function taskPlan(selected, verified = new Set()) {
    const list = [];
    const item = styleById(selected.styleId);
    if (!item)
        throw new RangeError("Unknown haircut");
    if (selected.reference) {
        if (!selected.referenceRights)
            throw new Error("The reference haircut rights checkbox is required");
        list.push({ action: "hair-transfer", options: {}, estimatedUnits: 3,
            note: "Reference task requires separate image upload, consent, 0-unit quote then explicit confirmation." });
    }
    else {
        if (!item.template_id || !verified.has(item.template_id))
            throw new Error("This template is not confirmed in a real S1 manifest");
        list.push({ action: "hair-style", options: { template_id: item.template_id }, estimatedUnits: 2,
            note: "One preview at the currently quoted YouCam rate, not a complete variant grid." });
    }
    for (const [key, value] of Object.entries(selected.adjuncts)) {
        const score = clampStrength(value);
        if (score <= 0)
            continue;
        if (!ADJUNCTS.includes(key))
            throw new RangeError("Unknown styling adjunct");
        const map = {
            bangs: "hair-bang", curl: "hair-curl", extension: "hair-extension", volume: "hair-volume",
        };
        list.push({ action: map[key], options: { strength: score },
            estimatedUnits: key === "volume" ? 2 : 1,
            note: "Separate styling task. This app does not yet chain multiple provider outputs." });
    }
    return list;
}
export function canApplyReference(selection, poseOkay, consentOkay) {
    return Boolean(selection.reference && selection.referenceRights && poseOkay && consentOkay);
}
//# sourceMappingURL=variants.js.map