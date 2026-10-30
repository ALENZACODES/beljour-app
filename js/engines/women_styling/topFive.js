function integer(value, low, high, name) {
    if (!Number.isInteger(value) || value < low || value > high) {
        throw new Error(`${name} must be an integer ${low}..${high}`);
    }
    return value;
}
export function firstSessionLift(depth, history) {
    integer(depth, 1, 10, 'base depth');
    if (history)
        return 16;
    if (depth <= 4)
        return 22;
    if (depth <= 7)
        return 26;
    return 30;
}
function brushWeight(x, y, stroke) {
    const dx = stroke.endX - stroke.startX, dy = stroke.endY - stroke.startY;
    const denom = dx * dx + dy * dy;
    const fraction = denom < 1e-10 ? 0 : Math.min(1, Math.max(0, ((x - stroke.startX) * dx + (y - stroke.startY) * dy) / denom));
    const px = stroke.startX + dx * fraction, py = stroke.startY + dy * fraction;
    const distance = Math.hypot(x - px, y - py);
    return Math.max(0, 1 - distance / stroke.radius);
}
function offset(mode, x, y, channel) {
    if (mode === 'daylight')
        return 0;
    if (mode === 'office')
        return [-4, -2, 3][channel] + 5 * (x - .5);
    if (mode === 'evening')
        return [-22, -17, -12][channel] + 8 * (1 - y);
    const radial = Math.max(0, 1 - 1.7 * Math.abs(x - .5) - 1.1 * Math.abs(y - .35));
    return [15, 15, 16][channel] + radial * 22;
}
function checkedRequest(req) {
    if (!req || !['W39', 'W98', 'W28'].includes(req.feature))
        throw new Error('Unknown W feature');
    const strength = integer(req.strength ?? 55, 0, 100, 'strength');
    const rgb = req.rgb ?? [132, 113, 106];
    if (rgb.length !== 3)
        throw new Error('RGB has three channels');
    rgb.forEach(c => integer(c, 0, 255, 'RGB'));
    const lighting = req.lighting ?? 'daylight';
    if (!['daylight', 'office', 'evening', 'flash'].includes(lighting))
        throw new Error('Unknown lighting');
    const baseDepth = integer(req.baseDepth ?? 5, 1, 10, 'base depth');
    const previouslyColoured = req.previouslyColoured ?? false;
    if (typeof previouslyColoured !== 'boolean')
        throw new Error('Colour history must be explicit');
    const strokes = req.strokes ?? [];
    if (strokes.length > 12 || (req.feature === 'W28' && strokes.length === 0)) {
        throw new Error('W28 needs between one and twelve strokes');
    }
    for (const stroke of strokes) {
        const values = [stroke.startX, stroke.startY, stroke.endX, stroke.endY];
        if (values.some(v => !Number.isFinite(v) || v < 0 || v > 1) ||
            !Number.isFinite(stroke.radius) || stroke.radius < .015 || stroke.radius > .35) {
            throw new Error('Invalid normalized brush geometry');
        }
    }
    return { feature: req.feature, strength, rgb, lighting, baseDepth, previouslyColoured, strokes };
}
export function editTopFive(image, width, height, mask, request) {
    const req = checkedRequest(request);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > 8192 || height > 8192 || width * height > 16_000_000) {
        throw new Error('Unsupported frame dimensions');
    }
    const channels = image.length / (width * height);
    if (![3, 4].includes(channels) || mask.length !== width * height || !mask.some(Boolean)) {
        throw new Error('RGB/RGBA frame and nonempty uint8 mask required');
    }
    const output = new Uint8Array(image);
    let changed = 0, outside = 0, maxDelta = 0, riskCount = 0;
    const lift = firstSessionLift(req.baseDepth, req.previouslyColoured);
    const targetY = Math.floor((req.rgb[0] * 3 + req.rgb[1] * 6 + req.rgb[2]) / 10);
    for (let row = 0; row < height; row++) {
        const y = row / Math.max(1, height - 1);
        for (let col = 0; col < width; col++) {
            const p = row * width + col, coverage = mask[p];
            if (coverage === 0 || req.strength === 0)
                continue;
            const x = col / Math.max(1, width - 1);
            let power = coverage * req.strength / 25500;
            if (req.feature === 'W28')
                power *= Math.max(...req.strokes.map(s => brushWeight(x, y, s)));
            let pixelChanged = false;
            const first = p * channels;
            const sourceY = (image[first] * 3 + image[first + 1] * 6 + image[first + 2]) / 10;
            for (let channel = 0; channel < 3; channel++) {
                const index = p * channels + channel, original = image[index];
                let desired, limit;
                if (req.feature === 'W39') {
                    const chromaShift = (req.rgb[channel] - targetY) * .75;
                    const luminanceShift = (targetY - sourceY) * .45;
                    desired = original + (chromaShift + luminanceShift) * power;
                    limit = 36;
                }
                else if (req.feature === 'W28') {
                    desired = original + lift * power;
                    limit = lift;
                }
                else {
                    desired = original + offset(req.lighting, x, y, channel) * power;
                    limit = 40;
                }
                const rounded = Math.floor(Math.min(255, Math.max(0, desired)) + .5);
                const bounded = Math.max(original - limit, Math.min(original + limit, rounded));
                output[index] = bounded;
                const delta = Math.abs(bounded - original);
                maxDelta = Math.max(maxDelta, delta);
                if (delta !== 0)
                    pixelChanged = true;
                if (req.feature === 'W98' && (bounded < 25 || bounded > 244))
                    riskCount++;
            }
            if (pixelChanged) {
                changed++;
                if (coverage === 0)
                    outside++;
            }
        }
    }
    let alphaChanged = 0;
    if (channels === 4)
        for (let p = 0; p < width * height; p++) {
            if (output[p * 4 + 3] !== image[p * 4 + 3])
                alphaChanged++;
        }
    const preserved = outside === 0 && alphaChanged === 0;
    return { pixels: output, evidence: {
            feature: req.feature, changed_pixels: changed, outside_mask_changed: outside,
            changed_alpha: alphaChanged, max_channel_delta: maxDelta, silhouette_preserved: preserved,
            still_her_score: preserved ? 100 : 0,
            visible_risk: req.feature === 'W98' && riskCount > 0,
            max_first_session_lift: req.feature === 'W28' ? lift : 0,
            provider_calls: 0,
            disclosure: 'Local screen simulation; not a salon outcome or skin assessment.',
        } };
}
//# sourceMappingURL=topFive.js.map