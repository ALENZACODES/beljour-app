/** Bounded expression displacement and procedural tears. Author: John Khan. */
import { regionMask } from "../../data/regions/index.js";
import { boundField, faceFrame, jacobian, minValue, pathDistance, quadratic } from "./geometry.js";
import { bilinear, blend, clamp01, landmarks, number, parameters, photo, result, smooth01 } from "./types.js";
export const DEFAULTS = { amount: 0.65, expression: 0.65, tears: 0.7,
    asymmetry: 0.25, phase: 0.0, tear_length: 0.45 };
export const LABEL = "Rain Expression simulation. Expression and tears are drawn locally.";
export function expressionField(points, width, height, p) {
    const frame = faceFrame(points), n = width * height;
    const dx = new Float64Array(n), dy = new Float64Array(n);
    const a = 1 + p.asymmetry * 0.35, b = 1 - p.asymmetry * 0.35;
    const controls = [
        [55, -frame.down[0] * frame.iod * 0.045 * a, -frame.down[1] * frame.iod * 0.045 * a, 0.34],
        [285, -frame.down[0] * frame.iod * 0.045 * b, -frame.down[1] * frame.iod * 0.045 * b, 0.34],
        [61, frame.down[0] * frame.iod * 0.04 * a, frame.down[1] * frame.iod * 0.04 * a, 0.42],
        [291, frame.down[0] * frame.iod * 0.04 * b, frame.down[1] * frame.iod * 0.04 * b, 0.42],
        [17, frame.across[0] * frame.iod * 0.009 * Math.sin(p.phase * 2 * Math.PI),
            frame.across[1] * frame.iod * 0.009 * Math.sin(p.phase * 2 * Math.PI), 0.28],
    ];
    for (const [index, vx, vy, radiusShare] of controls) {
        const radius2 = (frame.iod * radiusShare) ** 2;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const q = ((x + 0.5 - points[index][0]) ** 2 + (y + 0.5 - points[index][1]) ** 2) / radius2;
                const weight = Math.max(0, 1 - q) ** 3 * p.amount * p.expression;
                dx[y * width + x] += vx * weight;
                dy[y * width + x] += vy * weight;
            }
        }
    }
    const oval = regionMask("face_oval", points, width, height, { normalized: false, supersample: 2 }).data;
    for (let i = 0; i < n; i++) {
        dx[i] *= oval[i];
        dy[i] *= oval[i];
    }
    const bounded = boundField(dx, dy, width, height, frame.iod * 0.07);
    let maximum = 0;
    for (let i = 0; i < n; i++)
        maximum = Math.max(maximum, Math.hypot(bounded.dx[i], bounded.dy[i]));
    return { dx: bounded.dx, dy: bounded.dy, checks: {
            min_jacobian: minValue(jacobian(bounded.dx, bounded.dy, width, height)),
            maximum_displacement: maximum, displacement_iod: maximum / frame.iod, field_scale: bounded.scale,
        } };
}
export function tearLayers(points, width, height, p) {
    const frame = faceFrame(points), n = width * height;
    const water = new Float64Array(n), highlight = new Float64Array(n), rim = new Float64Array(n);
    for (const [side, index] of [145, 374].entries()) {
        const sign = side === 0 ? -1 : 1, length = p.length * (1 + sign * p.asymmetry * 0.18);
        const start = [points[index][0] + frame.down[0] * frame.iod * 0.025,
            points[index][1] + frame.down[1] * frame.iod * 0.025];
        const end = [start[0] + frame.down[0] * frame.iod * length + frame.across[0] * frame.iod * sign * 0.04,
            start[1] + frame.down[1] * frame.iod * length + frame.across[1] * frame.iod * sign * 0.04];
        const bend = frame.iod * (sign * 0.028 + 0.008 * Math.sin(p.phase * 2 * Math.PI));
        const control = [(start[0] + end[0]) * 0.5 + frame.across[0] * bend,
            (start[1] + end[1]) * 0.5 + frame.across[1] * bend];
        const maximumWidth = Math.max(0.8, frame.iod * 0.016);
        const path = quadratic(start, control, end), main = pathDistance(width, height, path, maximumWidth + 0.7);
        const glintShift = Math.max(0.4, frame.iod * 0.007);
        const glintPath = path.map((v) => [v[0] - frame.across[0] * glintShift, v[1] - frame.across[1] * glintShift]);
        const brightDistance = pathDistance(width, height, glintPath, maximumWidth + 0.7 + glintShift).distance;
        for (let i = 0; i < n; i++) {
            const t = main.progress[i];
            const lineWidth = Math.max(0.8, frame.iod * 0.016) * (0.65 + 0.35 * Math.sin(t * Math.PI));
            const taper = smooth01(t / 0.035) * smooth01((1 - t) / 0.07);
            const alpha = smooth01((lineWidth + 0.7 - main.distance[i]) / 1.0) * taper * p.tears * p.amount;
            const bright = Math.exp(-((brightDistance[i] / Math.max(0.55, lineWidth * 0.34)) ** 2)) * alpha;
            const dark = clamp01(main.distance[i] / Math.max(lineWidth, 0.1)) ** 2 * alpha;
            water[i] = 1 - (1 - water[i]) * (1 - alpha);
            highlight[i] = Math.max(highlight[i], bright);
            rim[i] = Math.max(rim[i], dark);
        }
    }
    const face = regionMask("face_oval", points, width, height, { normalized: false, supersample: 2 }).data;
    const eyes = regionMask("eyes", points, width, height, { normalized: false, supersample: 2 }).data;
    for (let i = 0; i < n; i++) {
        const allowed = eyes[i] <= 0 ? face[i] : 0;
        water[i] *= allowed;
        highlight[i] *= allowed;
        rim[i] *= allowed;
    }
    return { water, highlight, rim };
}
export function rainExpression(image, mesh, params) {
    const src = photo(image), p = parameters(params, DEFAULTS), n = src.width * src.height;
    const amount = number(p.amount, "amount", 0, 1), expression = number(p.expression, "expression", 0, 1);
    const tears = number(p.tears, "tears", 0, 1), asymmetry = number(p.asymmetry, "asymmetry", -1, 1);
    const phase = number(p.phase, "phase", 0, 1), length = number(p.tear_length, "tear_length", 0.15, 0.75);
    const points = landmarks(mesh, src.width, src.height);
    const field = expressionField(points, src.width, src.height, { amount, expression, asymmetry, phase });
    const x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        x[i] = i % src.width - field.dx[i];
        y[i] = Math.floor(i / src.width) - field.dy[i];
    }
    const warped = bilinear(src, x, y), water = tearLayers(points, src.width, src.height, { amount, tears, length, asymmetry, phase });
    const support = new Float64Array(n);
    let tearPixels = 0, maximumAlpha = 0;
    for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) {
            let v = warped[i * 3 + c] * (1 - 0.16 * water.rim[i]);
            v += (255 - v) * (0.62 * water.highlight[i] + 0.06 * water.water[i]);
            warped[i * 3 + c] = v;
        }
        support[i] = Math.hypot(field.dx[i], field.dy[i]) > 0 || water.water[i] > 0 ? 1 : 0;
        if (water.water[i] > 0.02)
            tearPixels++;
        maximumAlpha = Math.max(maximumAlpha, water.water[i]);
    }
    const out = blend(src, warped, support);
    return result("rain-expression", src, out, support, LABEL, { ...field.checks, tear_pixels: tearPixels, tear_alpha_max: maximumAlpha }, ["Procedural expression; it does not infer how you feel."], { displacement_x: field.dx, displacement_y: field.dy, tear_alpha: water.water });
}
