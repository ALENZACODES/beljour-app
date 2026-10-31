/** Conservative hair-colour suggestions from a reliable, caller-marked reading.
 * Mirrors api/plumb_api/engines/hair_palette/consultation.py: validated primary-head
 * landmarks, a caller-marked hair mask (optionally clipped to a primary-face box) and a
 * lighting-corrected reading are all required; an uncorrected or clamped correction is
 * unreliable_lighting. Swatches never exceed the measured level unless the visitor
 * allows lightening. The bounded session cache keeps derived readings only, keyed by a
 * SHA-256 digest of photo, brush masks and options; invalidate() clears it. Digital
 * swatches are estimates, not physical dye results. Author: John Khan.
 */
import { fibreReading, readFibreColour } from "../../commerce/shade-support.js";
import { validateAnchors } from "../menshair/render.js";
import { SHADE_DATA } from "../shade/generated/data.js";
import { measuredLevel, suggest } from "./palette.js";
export const MAX_CAPACITY = 16;
export const LABEL = "In-house hair-colour estimate from a corrected reading; not a physical dye result.";
function result(code, reading, level, suggestions, allow, cached) {
    return Object.freeze({ usable: code === null && suggestions.length > 0, code, reading, measured_level: level,
        suggestions, allow_lightening: allow, cached, label: LABEL });
}
async function digest(parts) {
    const total = parts.reduce((sum, p) => sum + p.length + 1, 0);
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
        for (let i = 0; i < part.length; i++)
            bytes[at++] = part[i] & 0xff;
        bytes[at++] = 0x7c;
    }
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
}
/** One visitor's bounded, in-memory consultation cache of derived readings. */
export class HairColourConsultation {
    capacity;
    readings = new Map();
    readingComputes = 0;
    constructor(capacity = 8) {
        this.capacity = capacity;
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
            throw new RangeError(`capacity must be 1..${MAX_CAPACITY}`);
        }
    }
    get size() { return this.readings.size; }
    invalidate() { this.readings.clear(); }
    async suggest(image, hairMask, landmarks, options = {}) {
        const allow = options.allowLightening ?? false;
        if (typeof allow !== "boolean")
            throw new RangeError("allowLightening must be a boolean");
        const refuse = (code) => result(code, null, null, [], allow, false);
        if (landmarks === null)
            return refuse("no_mesh");
        try {
            validateAnchors(landmarks);
        }
        catch {
            return refuse("no_mesh");
        }
        if ((image.channels !== 3 && image.channels !== 4) || image.data.length !== image.width * image.height * image.channels) {
            throw new RangeError("Hair consultation needs an RGB or RGBA photo");
        }
        const n = image.width * image.height;
        if (hairMask.length !== n)
            return refuse("invalid_mask");
        const mask = new Uint8Array(n);
        const [x0, y0, x1, y1] = options.primaryBox ?? [0, 0, image.width, image.height];
        if (![x0, y0, x1, y1].every(Number.isInteger) || !(0 <= x0 && x0 < x1 && x1 <= image.width &&
            0 <= y0 && y0 < y1 && y1 <= image.height))
            return refuse("invalid_mask");
        let count = 0;
        for (let i = 0; i < n; i++) {
            const x = i % image.width, y = Math.floor(i / image.width);
            if (hairMask[i] >= 0.5 && x >= x0 && x < x1 && y >= y0 && y < y1) {
                mask[i] = 1;
                count++;
            }
        }
        if (count < SHADE_DATA.thresholds.minimum_zone_pixels)
            return refuse("too_few_pixels");
        const flag = (m) => m ? Uint8Array.from(m, (v) => v >= 0.5 ? 1 : 0) : new Uint8Array(0);
        const key = await digest([Uint8Array.of(image.width & 0xff, image.width >> 8, image.height & 0xff, image.height >> 8, image.channels), image.data, mask, flag(options.neutralMask), flag(options.backgroundMask)]);
        let reading = this.readings.get(key);
        const cached = reading !== undefined;
        if (reading === undefined) {
            reading = readFibreColour(image, mask, { neutralMask: options.neutralMask, backgroundMask: options.backgroundMask });
            this.readingComputes++;
        }
        else {
            this.readings.delete(key);
        }
        this.readings.set(key, fibreReading(reading.lab, reading.white_mode, reading.clamped, reading.pixels));
        while (this.readings.size > this.capacity)
            this.readings.delete(this.readings.keys().next().value);
        if (reading.white_mode === "none" || reading.clamped)
            return result("unreliable_lighting", reading, null, [], allow, cached);
        const rows = suggest(reading.lab, { allowLightening: allow, count: options.count ?? 3 });
        return result(null, reading, measuredLevel(reading.lab), rows, allow, cached);
    }
}
