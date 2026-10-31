/** W73 non-destructive independent brow guides. Author: John Khan. */
import { byte, finish, number, options } from "./contracts.js";
import { curvePoints, drawPath, frameSummary } from "./geometry.js";
export function designShape(frames, settings) {
    const opts = options(settings, ["amount", "arch", "peak", "tail", "thickness", "leftArch", "rightArch"]);
    const arch = number(opts.arch ?? 0.06, "arch", -0.05, 0.15);
    const peak = number(opts.peak ?? 0.62, "peak", 0.35, 0.8);
    const tail = number(opts.tail ?? 0, "tail", -0.05, 0.2);
    const thickness = number(opts.thickness ?? 1, "thickness", 1, 1.6);
    const brows = frames.map(frame => {
        const localArch = number(opts[`${frame.side}Arch`] ?? arch, `${frame.side}Arch`, -0.05, 0.15);
        const points = curvePoints(frame, localArch, peak, tail), half = frame.height * thickness / 2;
        const upper = points.map(([x, y]) => [x + frame.up[0] * half, y + frame.up[1] * half]);
        const lower = points.map(([x, y]) => [x - frame.up[0] * half, y - frame.up[1] * half]);
        return { ...frameSummary(frame), side: frame.side, arch: localArch, peak, tail_scale: 1 + tail,
            centreline: points, upper, lower, proposed_thickness_px: frame.height * thickness };
    });
    return { thickness_scale: thickness, automatic_thinning: false, geometry_preserved: true, brows,
        warning: "Guide only. Individual asymmetry stays visible; an arch guide makes no lifting promise." };
}
export function renderShape(image, frames, settings) {
    const opts = options(settings, ["amount", "arch", "peak", "tail", "thickness", "leftArch", "rightArch"]);
    const amount = number(opts.amount ?? 0.5, "amount", 0, 1), design = designShape(frames, opts);
    const alpha = new Float64Array(image.width * image.height), output = Uint8ClampedArray.from(image.data);
    for (const brow of design.brows) {
        for (const name of ["upper", "lower"])
            drawPath(alpha, image.width, image.height, brow[name], 0.7, amount * 0.7);
    }
    for (let i = 0; i < alpha.length; i++) {
        for (let c = 0; c < 3; c++) {
            const o = i * image.channels + c;
            output[o] = byte(image.data[o] * (1 - alpha[i]) + [0, 145, 145][c] * alpha[i]);
        }
    }
    return finish(image, output, alpha, { automatic_thinning: false, geometry_preserved: true,
        left_width_px: frames[1].width, right_width_px: frames[0].width,
        thickness_scale: design.thickness_scale, guide_only: true }, [design.warning], "simulation", design);
}
