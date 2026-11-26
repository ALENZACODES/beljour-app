export function renderShave(photo, beard, cheek, amount = 1) { if (beard.length !== photo.width * photo.height || cheek.length !== beard.length)
    throw new RangeError("mask size mismatch"); if (!Number.isFinite(amount) || amount < 0 || amount > 1)
    throw new RangeError("amount outside range"); const data = new Uint8ClampedArray(photo.data), cheekColour = [0, 0, 0], active = []; for (let i = 0; i < cheek.length; i++)
    if (cheek[i] > .2)
        active.push(i); for (const i of active) {
    const o = i * photo.channels;
    for (let c = 0; c < 3; c++)
        cheekColour[c] += photo.data[o + c];
} for (let c = 0; c < 3; c++)
    cheekColour[c] = active.length ? cheekColour[c] / active.length : 100; for (let y = 2; y < photo.height - 2; y++)
    for (let x = 2; x < photo.width - 2; x++) {
        const i = y * photo.width + x, a = beard[i] * amount * .82;
        if (a <= 0)
            continue;
        const o = i * photo.channels;
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++)
                    sum += photo.data[((y + dy) * photo.width + x + dx) * photo.channels + c];
            const target = (sum / 25) * .75 + cheekColour[c] * .25;
            data[o + c] = Math.round(photo.data[o + c] * (1 - a) + target * a);
        }
    } if (photo.channels === 4)
    for (let i = 0; i < beard.length; i++)
        data[i * 4 + 3] = photo.data[i * 4 + 3]; return { data, report: { label: "clean-shave visual estimate", simulation: true, suitable_scope: "stubble and short beards only" } }; }
//# sourceMappingURL=index.js.map