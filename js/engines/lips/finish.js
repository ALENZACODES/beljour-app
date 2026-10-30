export const FINISHES = { matte: { name: "matte", opacity: 0.76, gloss: 0, matteAmount: 0.90, stainAsymmetry: false, textureFloor: 0.92 },
    satin: { name: "satin", opacity: 0.70, gloss: 0.30, matteAmount: 0.28, stainAsymmetry: false, textureFloor: 0.94 },
    gloss: { name: "gloss", opacity: 0.58, gloss: 0.90, matteAmount: 0, stainAsymmetry: false, textureFloor: 0.95 },
    stain: { name: "stain", opacity: 0.52, gloss: 0.02, matteAmount: 0, stainAsymmetry: true, textureFloor: 0.98 },
};
export function finishDefinition(name) {
    const value = FINISHES[name];
    if (!value)
        throw new RangeError("unknown lipstick finish");
    return value;
}
export function lineEnergy(photo, mask) {
    let total = 0;
    let count = 0;
    const w = photo.width;
    const h = photo.height;
    for (let y = 1; y < h; y++) {
        for (let x = 1; x < w; x++) {
            const i = y * w + x;
            if (mask[i] <= 0.1)
                continue;
            const o = i * photo.channels;
            const left = o - photo.channels;
            const above = o - w * photo.channels;
            const lum = (photo.data[o] + photo.data[o + 1] + photo.data[o + 2]) / 3;
            const lumLeft = (photo.data[left] + photo.data[left + 1] + photo.data[left + 2]) / 3;
            const lumAbove = (photo.data[above] + photo.data[above + 1] + photo.data[above + 2]) / 3;
            total += Math.hypot(lum - lumLeft, lum - lumAbove);
            count++;
        }
    }
    return count ? total / count : 0;
}
export function textureCorrelation(a, b, mask) {
    const xs = [];
    const ys = [];
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] <= 0.1)
            continue;
        const oa = i * a.channels;
        const ob = i * b.channels;
        xs.push((a.data[oa] + a.data[oa + 1] + a.data[oa + 2]) / 3);
        ys.push((b.data[ob] + b.data[ob + 1] + b.data[ob + 2]) / 3);
    }
    if (xs.length < 8)
        return 1;
    const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let covariance = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        covariance += dx * dy;
        vx += dx * dx;
        vy += dy * dy;
    }
    return vx <= 1e-12 || vy <= 1e-12 ? 1 : covariance / Math.sqrt(vx * vy);
}
export function finishMetadata(name, colour, amount) {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
        throw new RangeError("amount must be in 0..1");
    const cfg = finishDefinition(name);
    return { finish: cfg.name,
        opacity: cfg.opacity * amount,
        gloss: cfg.gloss * amount,
        matte_amount: cfg.matteAmount * amount,
        texture_floor: cfg.textureFloor,
        colour: [...colour],
        claim: "Digital appearance simulation, not a product wear test.",
    };
}
//# sourceMappingURL=finish.js.map