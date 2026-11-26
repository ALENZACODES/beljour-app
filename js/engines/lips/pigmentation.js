function mean(photo, mask, predicate) {
    const sums = [0, 0, 0];
    let count = 0;
    for (let y = 0; y < photo.height; y++) {
        for (let x = 0; x < photo.width; x++) {
            const i = y * photo.width + x;
            if (mask[i] <= 0.1 || !predicate(x, y))
                continue;
            const o = i * photo.channels;
            sums[0] += photo.data[o];
            sums[1] += photo.data[o + 1];
            sums[2] += photo.data[o + 2];
            count++;
        }
    }
    return count ? [sums[0] / count, sums[1] / count, sums[2] / count] : [0, 0, 0];
}
function delta(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.673; }
export function analysePigmentation(photo, mask) {
    if (mask.length !== photo.width * photo.height)
        throw new RangeError("mask shape does not match photo");
    let count = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < photo.height; y++)
        for (let x = 0; x < photo.width; x++) {
            const i = y * photo.width + x;
            if (mask[i] <= 0.1)
                continue;
            count++;
            sx += x;
            sy += y;
        }
    if (count < 8)
        throw new RangeError("not enough observed lip pixels for pigmentation analysis");
    const cx = sx / count;
    const cy = sy / count;
    const all = mean(photo, mask, () => true);
    const left = mean(photo, mask, x => x <= cx);
    const right = mean(photo, mask, x => x > cx);
    const upper = mean(photo, mask, (_x, y) => y <= cy);
    const lower = mean(photo, mask, (_x, y) => y > cy);
    const sideDelta = delta(left, right);
    const verticalDelta = delta(upper, lower);
    return { meanRgb: all,
        leftRgb: left,
        rightRgb: right,
        upperRgb: upper,
        lowerRgb: lower,
        sideDelta,
        verticalDelta,
        twoToneScore: Math.max(0, Math.min(1, Math.max(sideDelta, verticalDelta) / 0.25)),
    };
}
export function linerPairing(colour, stats) { const values = colour.map((channel, index) => (channel * 0.72 + stats.meanRgb[index] * 0.28) * 0.88); return values.map(value => Math.max(0, Math.min(255, Math.round(value)))); }
export function pigmentationDisclosure(stats) {
    const lines = ["Colour is composited over the observed lip pixels; the base lip is never normalized to pink."];
    if (stats.twoToneScore >= 0.25)
        lines.push("Visible pigmentation differences are retained across the lip.");
    if (stats.twoToneScore >= 0.55)
        lines.push("An optional liner pairing can improve edge consistency without lightening the base lip.");
    return lines;
}
//# sourceMappingURL=pigmentation.js.map