export const WEAR_SCENARIOS = { two_hours: { name: "two_hours", centreLoss: 0.25, innerRingLoss: 0.08, transferLoss: 0.04, edgeLoss: 0.02, label: "Broad two-hour finish-class estimate." },
    coffee: { name: "coffee", centreLoss: 0.46, innerRingLoss: 0.14, transferLoss: 0.12, edgeLoss: 0.03, label: "Coffee-contact finish-class estimate." },
    meal: { name: "meal", centreLoss: 0.68, innerRingLoss: 0.24, transferLoss: 0.20, edgeLoss: 0.08, label: "Meal-contact finish-class estimate." },
};
export function wearScenario(name) {
    const value = WEAR_SCENARIOS[name];
    if (!value)
        throw new RangeError("unknown lip wear scenario");
    return value;
}
export function wearField(mask, width, height, name, seed = 17) {
    if (mask.length !== width * height)
        throw new RangeError("mask dimensions do not match");
    const cfg = wearScenario(name);
    const out = new Float32Array(mask.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const dx = (x - width * 0.5) / (width * 0.09 + 1);
            const dy = (y - height * 0.59) / (height * 0.035 + 1);
            const centre = Math.exp(-(dx * dx + dy * dy) * 2);
            const radius = Math.sqrt(((x - width * 0.5) / (width * 0.13 + 1)) ** 2 + ((y - height * 0.59) / (height * 0.05 + 1)) ** 2);
            const ring = Math.exp(-((radius - 1) ** 2) * 7);
            const transfer = Math.max(0, Math.min(1, Math.sin(x * 0.13 + seed * 0.31) * 0.5 + 0.5));
            const here = mask[i];
            const up = mask[Math.max(0, y - 1) * width + x];
            const down = mask[Math.min(height - 1, y + 1) * width + x];
            const left = mask[y * width + Math.max(0, x - 1)];
            const right = mask[y * width + Math.min(width - 1, x + 1)];
            const edge = Math.max(Math.abs(here - up), Math.abs(here - down), Math.abs(here - left), Math.abs(here - right));
            const loss = cfg.centreLoss * centre + cfg.innerRingLoss * ring + cfg.transferLoss * transfer * centre + cfg.edgeLoss * edge;
            out[i] = Math.max(0, Math.min(1, here * (1 - Math.max(0, Math.min(0.95, loss)))));
        }
    }
    return out;
}
export function centreRetention(mask, worn, width, height) {
    let base = 0;
    let after = 0;
    let count = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = (x - width * 0.5) / (width * 0.10 + 1);
            const dy = (y - height * 0.59) / (height * 0.04 + 1);
            const i = y * width + x;
            if (dx * dx + dy * dy >= 1 || mask[i] <= 0.1)
                continue;
            base += mask[i];
            after += worn[i];
            count++;
        }
    }
    if (!count || base <= 1e-8)
        return 1;
    return after / base;
}
export function monotonicWear(mask, width, height) { const two = centreRetention(mask, wearField(mask, width, height, "two_hours"), width, height); const coffee = centreRetention(mask, wearField(mask, width, height, "coffee"), width, height); const meal = centreRetention(mask, wearField(mask, width, height, "meal"), width, height); return { two_hours: two, coffee, meal, monotonic: two > coffee && coffee > meal }; }
