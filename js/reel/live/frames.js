import { requireColour } from "../../engines/core/buffer.js";
export const NO_INPUTS = { points: null, person: null };
export function copyFrame(image) {
    return { width: image.width, height: image.height, channels: image.channels, data: new Uint8ClampedArray(image.data) };
}
export function checkFrame(frame, previous) {
    requireColour(frame.image);
    if (!Number.isFinite(frame.t) || frame.t < 0)
        throw new RangeError("frame time must be a finite, non-negative number of seconds");
    if (previous !== null && frame.t <= previous)
        throw new RangeError("frames must arrive in increasing time order");
}
export function checkStrength(strength) {
    if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
}
export function checkPerson(person, image) {
    if (!person)
        return;
    if (person.length !== image.width * image.height)
        throw new RangeError("person mask must have one value per pixel");
    for (const v of person)
        if (!(v >= 0 && v <= 1))
            throw new RangeError("person mask values must be 0..1");
}
/** Run one effect over an ordered frame source; each output goes straight to the sink. */
export async function processSequence(frames, effect, inputsFor, sink, strength = 100) {
    effect.reset();
    let previous = null, index = 0, changed = 0;
    const notes = new Set();
    for await (const frame of frames) {
        checkFrame(frame, previous);
        previous = frame.t;
        const inputs = await inputsFor(frame, index);
        const amount = typeof strength === "function" ? strength(frame.t) : strength;
        checkStrength(amount);
        const output = effect.apply(frame, inputs, amount);
        if (output.changed)
            changed++;
        if (output.note)
            notes.add(output.note);
        await sink(output, frame, index);
        index++;
    }
    return { frames: index, changed, notes: [...notes] };
}
//# sourceMappingURL=frames.js.map