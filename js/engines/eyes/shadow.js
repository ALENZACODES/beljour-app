import { lidBounds, nativePlacement } from "./geometry.js";
import { smoothstep } from "./raster.js";
export const TECHNIQUES = ["cut_crease", "halo", "smokey"];
export const FINISHES = ["foil", "duochrome"];
export function pigmentPayoff(skinDepth, colour, transparency) {
    const brightness = (.2126 * colour[0] + .7152 * colour[1] + .0722 * colour[2]) / 255;
    const pastel = brightness > .65, base = (1 - transparency) * (1 + (pastel ? .35 : .10) * skinDepth);
    const opacity = Math.min(.95, Math.max(.05, base)), warnings = [];
    if (pastel && skinDepth > .6 && transparency > .65)
        warnings.push("This sheer pastel may not show on a deep lid. Try a more opaque base; product payoff is unverified.");
    return { opacity, pastel, warnings, assumption: "Display pigment approximation; not a measured product-opacity value." };
}
export function flipColour(primary, secondary, angle, finish, u = .5) {
    if (!FINISHES.includes(finish))
        throw new RangeError("shadow finish must be foil or duochrome");
    const phase = Math.sin(angle * Math.PI / 180 + (u - .5) * .25);
    const flip = finish === "duochrome" ? .5 + .5 * phase : .16 + .22 * Math.max(0, phase);
    const light = finish === "foil" ? 1 + .10 * Math.max(0, Math.cos(angle * Math.PI / 180)) : 1;
    const value = (c) => Math.min(255, Math.max(0, ((1 - flip) * primary[c] + flip * secondary[c]) * light));
    return [value(0), value(1), value(2)];
}
export function shadowFields(image, frame, request) {
    const { height, width, channels } = image, anatomy = request.anatomy[frame.side];
    const technique = request.style || (request.feature === "W67" ? "duochrome" : "halo");
    if (request.feature === "W67") {
        if (!FINISHES.includes(technique))
            throw new RangeError("unsupported light-shift finish");
    }
    else if (!TECHNIQUES.includes(technique))
        throw new RangeError("unsupported shadow technique");
    const report = nativePlacement(frame, anatomy);
    report.style = technique;
    const mask = new Float64Array(height * width), pigment = new Float64Array(height * width * 3);
    if (!frame.visible)
        return { mask, pigment, report };
    const corners = [-.1, 1.1].flatMap(u => [-.05, frame.brow_space].map(v => frame.point(u, v)));
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p[0]))));
    const x1 = Math.min(width, Math.ceil(Math.max(...corners.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p[1]))));
    const y1 = Math.min(height, Math.ceil(Math.max(...corners.map(p => p[1]))));
    let depthSum = 0, depthCount = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const [u, v] = frame.local(x + .5, y + .5);
            if (u < .03 || u > .97)
                continue;
            const [low, high] = lidBounds(frame, anatomy, u);
            if (v < low || v > high || high - low < 1e-8)
                continue;
            const s = (v - low) / (high - low);
            const edge = smoothstep(.03, .13, u) * (1 - smoothstep(.87, .97, u)) * smoothstep(0, .08, s) * (1 - smoothstep(.82, 1, s));
            let weight = .85;
            if (technique === "cut_crease")
                weight = s < .72 ? .90 : .22;
            else if (technique === "halo")
                weight = .35 + .6 * Math.abs(2 * u - 1);
            else if (technique === "smokey")
                weight = .25 + .7 * (1 - s) ** (.65 + request.blend);
            const index = y * width + x, offset = index * channels;
            const luminance = image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722;
            const depth = request.skin_depth ?? 1 - luminance / 255;
            depthSum += depth;
            depthCount++;
            const payoff = pigmentPayoff(depth, request.colour, request.transparency);
            mask[index] = edge * weight * payoff.opacity;
            let colour = request.feature === "W67" ? flipColour(request.colour, request.secondary_colour, request.angle, technique, u) : request.colour;
            if (technique === "halo" && u > .36 && u < .64)
                colour = [Math.min(255, colour[0] + 24), Math.min(255, colour[1] + 24), Math.min(255, colour[2] + 24)];
            for (let c = 0; c < 3; c++)
                pigment[index * 3 + c] = colour[c];
        }
    }
    report.payoff = pigmentPayoff(depthCount ? depthSum / depthCount : 0, request.colour, request.transparency);
    report.angle_degrees = request.angle;
    report.base_transparency = request.transparency;
    report.glitter_particles = 0;
    report.motion_parameter = request.feature === "W67" ? "angle" : null;
    return { mask, pigment, report };
}
