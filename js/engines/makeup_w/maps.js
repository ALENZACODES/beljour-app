/** Makeup placement maps mirrored from the Python reference. Author: John Khan. */
function ellipse(width, height, cx, cy, rx, ry) {
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const xn = x / Math.max(width - 1, 1), yn = y / Math.max(height - 1, 1);
            if (((xn - cx) / Math.max(rx, 1e-6)) ** 2 + ((yn - cy) / Math.max(ry, 1e-6)) ** 2 <= 1)
                out[y * width + x] = 1;
        }
    return out;
}
function union(a, b) {
    const out = new Float32Array(a);
    for (let i = 0; i < out.length; i++)
        out[i] = Math.max(out[i], b[i]);
    return out;
}
export function blushMap(width, height, shape) {
    const positions = {
        round: [[.34, .54, .10, .045], [.66, .54, .10, .045]],
        long: [[.34, .57, .12, .04], [.66, .57, .12, .04]],
        heart: [[.35, .56, .09, .05], [.65, .56, .09, .05]],
        square: [[.34, .56, .08, .06], [.66, .56, .08, .06]],
        oval: [[.35, .55, .10, .05], [.65, .55, .10, .05]],
        balanced: [[.35, .55, .10, .05], [.65, .55, .10, .05]],
    };
    const [left, right] = positions[shape] ?? positions.balanced;
    return union(ellipse(width, height, ...left), ellipse(width, height, ...right));
}
export function concealerMap(width, height) {
    return union(union(ellipse(width, height, .38, .44, .11, .055), ellipse(width, height, .62, .44, .11, .055)), ellipse(width, height, .50, .60, .08, .08));
}
export function correctionMap(width, height, issue) {
    if (issue === "under_eye")
        return union(ellipse(width, height, .38, .45, .12, .06), ellipse(width, height, .62, .45, .12, .06));
    if (issue === "redness")
        return ellipse(width, height, .50, .56, .24, .16);
    return ellipse(width, height, .50, .53, .18, .14);
}
export function contourMap(width, height, shape) {
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const xn = x / Math.max(width - 1, 1), yn = y / Math.max(height - 1, 1);
            let hit = ((xn < .25 || xn > .75) && yn > .25 && yn < .50) || ((xn < .32 || xn > .68) && yn > .62 && yn < .78);
            if (shape === "long")
                hit ||= yn > .72 && xn > .35 && xn < .65;
            else if (shape === "round")
                hit ||= (xn < .30 || xn > .70) && yn > .48 && yn < .66;
            out[y * width + x] = hit ? 1 : 0;
        }
    return out;
}
//# sourceMappingURL=maps.js.map