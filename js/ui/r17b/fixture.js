function ellipse(w, h, cx, cy, rx, ry) { const out = new Float32Array(w * h); for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        const dx = (x / w - cx) / rx, dy = (y / h - cy) / ry;
        out[y * w + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
    } return out; }
function union(...rows) { const out = new Float32Array(rows[0]?.length ?? 0); for (const row of rows)
    for (let i = 0; i < out.length; i++)
        out[i] = Math.max(out[i], row[i]); return out; }
export function fixture(width = 96, height = 112) { const data = new Uint8ClampedArray(width * height * 4); for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = 82 + Math.round(20 * x / width);
        data[i + 1] = 59 + Math.round(16 * y / height);
        data[i + 2] = 49 + Math.round(10 * x / width);
        data[i + 3] = 255;
    } const hair = ellipse(width, height, .5, .28, .36, .31), scalp = ellipse(width, height, .5, .25, .20, .16), skin = ellipse(width, height, .5, .52, .30, .38), cheek = union(ellipse(width, height, .34, .58, .10, .07), ellipse(width, height, .66, .58, .10, .07)), eye = union(ellipse(width, height, .39, .44, .07, .035), ellipse(width, height, .61, .44, .07, .035)), lip = ellipse(width, height, .5, .69, .10, .04), brow = union(ellipse(width, height, .39, .39, .08, .022), ellipse(width, height, .61, .39, .08, .022)), stubble = ellipse(width, height, .5, .66, .18, .11), beard = ellipse(width, height, .5, .70, .21, .14), palette_region = ellipse(width, height, .25, .55, .12, .12); const geometry = { crown: [.5, .13], left_temple: [.27, .33], right_temple: [.73, .33], chin: [.5, .84] }; return { photo: { width, height, channels: 4, data }, hair, scalp, masks: { skin, cheek, eye, lip, brow, stubble, beard, palette_region }, geometry }; }
