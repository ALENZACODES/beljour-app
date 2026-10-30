function tint(photo, data, mask, colour, strength) {
    for (let i = 0; i < mask.length; i++) {
        const alpha = Math.max(0, Math.min(1, mask[i] * strength));
        if (alpha <= 0)
            continue;
        const offset = i * photo.channels;
        for (let channel = 0; channel < 3; channel++) {
            data[offset + channel] = Math.trunc(data[offset + channel] * (1 - alpha) + colour[channel] * alpha);
        }
    }
}
function blurCurrent(photo, data) {
    const out = new Float64Array(photo.width * photo.height * 3);
    for (let y = 0; y < photo.height; y++)
        for (let x = 0; x < photo.width; x++) {
            const i = y * photo.width + x;
            for (let channel = 0; channel < 3; channel++) {
                let total = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const yy = Math.max(0, Math.min(photo.height - 1, y + dy));
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = Math.max(0, Math.min(photo.width - 1, x + dx));
                        total += data[(yy * photo.width + xx) * photo.channels + channel];
                    }
                }
                out[i * 3 + channel] = total / 9;
            }
        }
    return out;
}
export function renderGenderLook(photo, masks, options) {
    if (!["normal", "extra", "hyper"].includes(options.level) || !Number.isFinite(options.amount) || options.amount < 0 || options.amount > 1) {
        throw new RangeError("invalid options");
    }
    const brow = masks.brow;
    const skin = masks.skin;
    const stubble = masks.stubble ?? new Float32Array(photo.width * photo.height);
    if (!brow || !skin)
        throw new RangeError("brow and skin masks required");
    if (brow.length !== photo.width * photo.height || skin.length !== brow.length || stubble.length !== brow.length) {
        throw new RangeError("mask size mismatch");
    }
    const scale = { normal: .45, extra: .72, hyper: 1 }[options.level] * options.amount;
    const data = new Uint8ClampedArray(photo.data);
    if (options.direction === "feminine") {
        tint(photo, data, brow, [72, 48, 42], scale * .35);
        tint(photo, data, stubble, [120, 92, 78], scale * .45);
    }
    else if (options.direction === "masculine") {
        tint(photo, data, brow, [52, 39, 34], scale * .45);
        tint(photo, data, stubble, [48, 41, 37], scale * .28);
    }
    if (options.direction !== "neutral") {
        const blurred = blurCurrent(photo, data);
        const factor = (options.direction === "feminine" ? -.10 : .10) * scale;
        const snapshot = new Uint8ClampedArray(data);
        for (let i = 0; i < skin.length; i++) {
            const alpha = skin[i] * scale * .25;
            if (alpha <= 0)
                continue;
            const offset = i * photo.channels;
            for (let channel = 0; channel < 3; channel++) {
                const rgb = snapshot[offset + channel];
                const detail = rgb - blurred[i * 3 + channel];
                const styled = rgb + detail * factor;
                data[offset + channel] = Math.trunc(Math.max(0, Math.min(255, rgb * (1 - alpha) + styled * alpha)));
            }
        }
    }
    if (photo.channels === 4)
        for (let i = 0; i < photo.width * photo.height; i++)
            data[i * 4 + 3] = photo.data[i * 4 + 3];
    return {
        data,
        report: {
            direction: options.direction,
            level: options.level,
            simulation: true,
            identity_geometry_changed: false,
            stubble_source: "imported existing beard-region mask",
        },
    };
}
//# sourceMappingURL=index.js.map