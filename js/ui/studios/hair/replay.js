/** R10 synthetic-only hairstyle cassette display; no fetch or live YouCam calls.
 * This is deliberately not labelled a 'recorded YouCam result': the S2 cassette
 * and its image are hand-made replay fixtures. Only one example image exists.
 * Author: John Khan.
 */
export const HAIR_REPLAY = {
    schema: "beljour-cassette/1", id: "s2_hairstyle", source: "synthetic",
    asset: "hair-assets/s2-hairstyle-synthetic.jpeg", width: 900, height: 1100,
    step: "hairstyle", templateCount: 12, caption: "Synthetic illustrated example — not a YouCam result",
    flow: "saved sample in this site, no photo sent and no YouCam units used",
};
export function replaySample() {
    return { status: "sample", image: HAIR_REPLAY.asset, title: "Synthetic hair example",
        provenance: "Synthetic, hand-made fixture", note: HAIR_REPLAY.caption,
        synthetic: true };
}
export function noReplay(note = "Choose a style to view its concept. No result has been rendered.") {
    return { status: "none", image: null, title: "No preview", provenance: "Not tested", note, synthetic: false };
}
export function liveHairResult(result, label) {
    if (result.status !== "done" || !result.image)
        return { status: "error", image: null,
            title: "Result unavailable", provenance: "Not tested", note: "The task returned no usable image.", synthetic: false };
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(result.image)) {
        throw new Error("Unexpected image data returned by styling");
    }
    const synthetic = result.provenance?.synthetic === true;
    if (synthetic)
        return { status: "sample", image: result.image, title: label,
            provenance: "Synthetic replay, not YouCam", note: "Simulated provider reply; realism untested.", synthetic: true };
    if (result.provenance?.provider !== "youcam")
        throw new Error("Result has no approved YouCam provenance");
    return { status: "live", image: result.image, title: label,
        provenance: "YouCam styling result", note: "Preview result. Check the hair, face and edges yourself.", synthetic: false };
}
export function replayChecklist() {
    return { providerCalls: 0, externalUrls: 0, dataFlow: "local static asset", score: null,
        resultCount: 1, replayLabel: HAIR_REPLAY.caption };
}
//# sourceMappingURL=replay.js.map