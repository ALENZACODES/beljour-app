/** Privacy-safe aggregate acceptance for local tinted fibre previews.
 * Mirrors api/plumb_api/engines/concealer/colour_acceptance.py. Every attempted result
 * stays in the denominator, counted as rendered_closer, adverse_shift, unchanged, refused
 * or preview_only (moving frames only). release_pass is false unless the caller supplies
 * external evidence and every attempt was a released frame that moved closer. Counts
 * and the worst released distance only. Author: John Khan.
 */
export const STATUSES = ["rendered_closer", "adverse_shift", "unchanged", "refused", "preview_only"];
export const MAX_RECEIPTS = 100_000;
/** Count every attempt by outcome; release_pass needs external evidence. */
export function summarizeColourAcceptance(receipts, options = {}) {
    const external = options.externalEvidence ?? false;
    if (typeof external !== "boolean")
        throw new RangeError("externalEvidence must be a boolean");
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    let total = 0, worst = null;
    for (const receipt of receipts) {
        if (!STATUSES.includes(receipt?.status))
            throw new RangeError("unknown receipt status");
        if (receipt.status === "preview_only" && receipt.phase !== "moving") {
            throw new RangeError("preview-only receipts must come from moving frames");
        }
        if (++total > MAX_RECEIPTS)
            throw new RangeError("too many receipts");
        counts[receipt.status]++;
        const after = receipt.evidence?.after_delta_e;
        if (typeof after === "number")
            worst = worst === null ? after : Math.max(worst, after);
    }
    const closer = total ? counts.rendered_closer / total : 0;
    return { format: "beljour-colour-acceptance/1", attempted: total, released: total - counts.preview_only, counts,
        closer_rate: Math.round(closer * 1e6) / 1e6, worst_after_delta_e: worst === null ? null : Math.round(worst * 1e4) / 1e4,
        external_evidence: external, release_pass: external && total > 0 && counts.rendered_closer === total,
        evidence: external ? "external_review" : "synthetic_local", tested_against_real_products: false };
}
