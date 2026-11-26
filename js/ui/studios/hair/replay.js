/** R10 synthetic-only hairstyle cassette display; no fetch.
 * This is deliberately not labelled a recorded result: the S2 cassette
 * and its image are hand-made replay fixtures. Only one example image exists.
 * Author: John Khan.
 */
export const HAIR_REPLAY = {
    schema: "beljour-cassette/1", id: "s2_hairstyle", source: "synthetic",
    asset: "hair-assets/s2-hairstyle-synthetic.jpeg", width: 900, height: 1100,
    step: "hairstyle", templateCount: 12, caption: "Synthetic illustrated example — not your photo",
    flow: "saved sample in this site; no photo is sent",
};
export function replaySample() {
    return { status: "sample", image: HAIR_REPLAY.asset, title: "Synthetic hair example",
        provenance: "Synthetic, hand-made fixture", note: HAIR_REPLAY.caption,
        synthetic: true };
}
export function noReplay(note = "Choose a style to view its concept. No result has been rendered.") {
    return { status: "none", image: null, title: "No preview", provenance: "Not tested", note, synthetic: false };
}
export function replayChecklist() {
    return { providerCalls: 0, externalUrls: 0, dataFlow: "local static asset", score: null,
        resultCount: 1, replayLabel: HAIR_REPLAY.caption };
}
//# sourceMappingURL=replay.js.map