export function oralFixture(width = 96, height = 64) {
    if (width < 32 || height < 24)
        throw new Error("fixture too small");
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4, dx = (x - width / 2) / (width * .42), dy = (y - height * .56) / (height * .30), mouth = dx * dx + dy * dy < 1, teeth = Math.abs(dx) < .72 && dy > -.30 && dy < .32, gum = Math.abs(dx) < .70 && dy > -.48 && dy < -.20;
            const rgb = gum ? [173, 83, 89] : teeth ? [224, 218, 204] : mouth ? [84, 35, 40] : [159, 119, 98];
            pixels[i] = rgb[0];
            pixels[i + 1] = rgb[1];
            pixels[i + 2] = rgb[2];
            pixels[i + 3] = 255;
        }
    const teeth = [[.28, .46], [.72, .46], [.70, .65], [.30, .65]], gum = [[.30, .40], [.70, .40], [.68, .48], [.32, .48]];
    return { pixels, width, height, regions: { teeth, gum } };
}
export function motionFixture(frames = 5) {
    if (frames < 2 || frames > 20)
        throw new Error("frames must be 2..20");
    const out = [];
    for (let i = 0; i < frames; i++) {
        const t = i / (frames - 1), dy = Math.sin(t * Math.PI) * .025, scale = 1 + Math.sin(t * Math.PI) * .06, teeth = [[.5 - (.22 * scale), .46 - dy], [.5 + (.22 * scale), .46 - dy], [.5 + (.20 * scale), .65 + dy], [.5 - (.20 * scale), .65 + dy]];
        out.push({ teeth, timeMs: i * 80 });
    }
    return out;
}
//# sourceMappingURL=synthetic.js.map