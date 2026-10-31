const UPPER_CENTRE = [13, 312, 311, 310, 415, 308, 78, 191, 80, 81, 82];
const LOWER_CENTRE = [14, 317, 402, 318, 324, 308, 78, 95, 88, 178, 87];
const CORNERS = [61, 291];
function mean(points, ids) {
    let x = 0;
    let y = 0;
    for (const id of ids) {
        x += points[id][0];
        y += points[id][1];
    }
    return [x / ids.length, y / ids.length];
}
export function measureLip(points) {
    if (points.length !== 468 && points.length !== 478) {
        throw new RangeError("lip anatomy requires 468 or 478 checked points");
    }
    for (const [x, y] of points) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
            throw new RangeError("lip anatomy points must be finite");
    }
    const left = points[CORNERS[0]];
    const right = points[CORNERS[1]];
    const width = Math.hypot(right[0] - left[0], right[1] - left[1]);
    if (width < 0.015)
        throw new RangeError("lip width is too small to measure reliably");
    const upper = mean(points, UPPER_CENTRE);
    const lower = mean(points, LOWER_CENTRE);
    const centre = [
        (left[0] + right[0] + upper[0] + lower[0]) / 4,
        (left[1] + right[1] + upper[1] + lower[1]) / 4,
    ];
    const upperHeight = Math.abs(centre[1] - upper[1]);
    const lowerHeight = Math.abs(lower[1] - centre[1]);
    const height = Math.max(upperHeight + lowerHeight, 1e-8);
    const cupidLeft = points[82];
    const cupidMid = points[13];
    const cupidRight = points[312];
    const cupidLine = (cupidLeft[1] + cupidRight[1]) / 2;
    const cupidDepth = (cupidLine - cupidMid[1]) / width;
    const cornerTilt = (right[1] - left[1]) / width;
    const verticalMid = (upper[1] + lower[1]) / 2;
    const leftHeight = Math.abs(points[61][1] - verticalMid);
    const rightHeight = Math.abs(points[291][1] - verticalMid);
    const asymmetry = Math.abs(leftHeight - rightHeight) / Math.max(height, 1e-8);
    const mouthOpening = Math.max(0, (points[14][1] - points[13][1]) / width);
    return { centre,
        width,
        height,
        upperHeight,
        lowerHeight,
        upperToLower: upperHeight / Math.max(lowerHeight, 1e-8),
        cupidDepth,
        cornerTilt,
        asymmetry,
        mouthOpening,
    };
}
export function lipStyleWeights(style) {
    const table = { natural_plump: { cupid: 0.85, upperLateral: 0.75, lowerCentre: 0.95, lowerLateral: 0.75, corners: 0.05 },
        cupid_focus: { cupid: 1.0, upperLateral: 0.42, lowerCentre: 0.45, lowerLateral: 0.32, corners: 0 },
        keyhole: { cupid: 0.82, upperLateral: 0.58, lowerCentre: 1.0, lowerLateral: 0.52, corners: 0 },
        vertical_lift: { cupid: 1.0, upperLateral: 0.50, lowerCentre: 0.28, lowerLateral: 0.22, corners: 0 },
    };
    const value = table[style];
    if (!value)
        throw new RangeError("unknown lip shape style");
    return value;
}
export function plausibilityCap(anatomy, style) {
    let cap = 0.70;
    if (anatomy.asymmetry > 0.18)
        cap -= 0.10;
    if (anatomy.mouthOpening > 0.12)
        cap -= 0.08;
    if (anatomy.upperToLower > 1.45 || anatomy.upperToLower < 0.45)
        cap -= 0.06;
    if (style === "vertical_lift")
        cap = Math.min(cap, 0.54);
    if (style === "cupid_focus" && anatomy.cupidDepth > 0.08)
        cap = Math.min(cap, 0.58);
    return Math.max(0.32, Math.min(0.72, cap));
}
export function zoneProfile(width, weights) {
    if (!Number.isInteger(width) || width < 4)
        throw new RangeError("profile width must be at least four samples");
    const out = new Float64Array(width);
    let peak = 0;
    for (let i = 0; i < width; i++) {
        const x = -1 + (2 * i) / (width - 1);
        const cupid = Math.exp(-((x / 0.22) ** 2) * 2.2);
        const upper = Math.exp(-(((Math.abs(x) - 0.47) / 0.24) ** 2) * 2.0);
        const lowerCentre = Math.exp(-((x / 0.45) ** 2) * 1.6);
        const lowerSide = Math.exp(-(((Math.abs(x) - 0.52) / 0.28) ** 2) * 1.8);
        const corner = Math.max(0, Math.min(1, (Math.abs(x) - 0.72) / 0.28));
        const value = cupid * weights.cupid
            + upper * weights.upperLateral
            + lowerCentre * weights.lowerCentre
            + lowerSide * weights.lowerLateral
            + corner * weights.corners;
        out[i] = value;
        peak = Math.max(peak, value);
    }
    if (peak > 1e-12)
        for (let i = 0; i < out.length; i++)
            out[i] /= peak;
    return out;
}
export function describeLip(anatomy) {
    return { width: anatomy.width,
        height: anatomy.height,
        upper_to_lower: anatomy.upperToLower,
        cupid_depth: anatomy.cupidDepth,
        corner_tilt: anatomy.cornerTilt,
        asymmetry: anatomy.asymmetry,
        mouth_opening: anatomy.mouthOpening,
        interpretation: "Measured geometry only. No attractiveness or procedure-suitability score.",
    };
}
