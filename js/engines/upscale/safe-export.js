import { canvasEncoder } from "../../save/export.js";
import { exportColourSafe } from "./colour-export.js";
import { SAFE_LABEL } from "./safe.js";
function rgba(result) {
    const { photo } = result;
    if (photo.channels === 4)
        return photo.data;
    const out = new Uint8ClampedArray(photo.width * photo.height * 4);
    for (let source = 0, target = 0; source < photo.data.length; source += 3, target += 4) {
        out.set(photo.data.subarray(source, source + 3), target);
        out[target + 3] = 255;
    }
    return out;
}
export async function exportSafeUpscale(result, name, settings = {}, gate, encoder = canvasEncoder()) {
    if (!result || result.release !== true)
        throw new RangeError("Only a full-size release can be exported");
    if (result.label !== SAFE_LABEL)
        throw new RangeError("Export needs the guarded upscale label");
    const { photo, allocation, scale } = result;
    if (photo.width !== allocation.width * scale || photo.height !== allocation.height * scale ||
        photo.data.length !== allocation.outputBytes) {
        throw new RangeError("Upscale result does not match its admitted size");
    }
    if (gate) {
        if (!gate.session.exportable(gate.ticket))
            throw new RangeError("This upscale job is no longer current");
        if (gate.ticket.scale !== scale || gate.ticket.detailLevel !== result.detailLevel ||
            gate.ticket.lockLevel !== result.lockLevel || gate.ticket.width !== allocation.width ||
            gate.ticket.height !== allocation.height) {
            throw new RangeError("Upscale result does not match its release ticket");
        }
    }
    return exportColourSafe({ width: photo.width, height: photo.height, data: rgba(result) }, name, settings, encoder);
}
