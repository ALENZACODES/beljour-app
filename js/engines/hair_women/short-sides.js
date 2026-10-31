/** Tonal short-side hairstyle simulations, scoped to approved hair masks. Author: John Khan. */
import { DEFAULT_LOCK_LEVEL, PixelChangeGuard, checkedLevel } from "../gender_look/levels.js";
import { validateGeometry, validateMask, validatePhoto } from "./contracts.js";
export const STYLES = [
    "pixie_taper", "side_undercut", "nape_undercut", "long_side_shave", "bixie",
    "tapered_twa", "bob_short_sides", "curly_short_sides",
];
export const SIMULATION_LABEL = "Local hairstyle simulation; not a generated haircut or salon guarantee.";
function copy(value) {
    const result = new Uint8ClampedArray(new ArrayBuffer(value.length));
    result.set(value);
    return result;
}
function area(geometry, width, height, style) {
    const zone = new Float32Array(new ArrayBuffer(width * height * 4));
    const score = new Float32Array(new ArrayBuffer(width * height * 4));
    const top = geometry.crown[1] * height;
    const bottom = geometry.chin[1] * height;
    const left = geometry.left_temple[0] * width;
    const right = geometry.right_temple[0] * width;
    const cx = (left + right) / 2;
    const halfWidth = Math.max((right - left) / 2, 1);
    const halfHeight = Math.max(bottom - top, 1);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const horizontal = (x - cx) / halfWidth;
            const vertical = (y - top) / halfHeight;
            const side = Math.max(0, Math.min(1, (Math.abs(horizontal) - .26) / .74));
            const nape = Math.max(0, Math.min(1, (vertical - .4) / .6));
            let active = false;
            let grade = 1;
            switch (style) {
                case "pixie_taper":
                    active = side > .05 && vertical > .08 && vertical < .85;
                    grade = 1 - side * (.72 + .28 * nape);
                    break;
                case "side_undercut":
                    active = horizontal < -.22 && vertical > .04 && vertical < .89;
                    grade = .45 + horizontal * .7 - nape * .12;
                    break;
                case "nape_undercut":
                    active = vertical > .47 && Math.abs(horizontal) < 1.1;
                    grade = 1 - nape;
                    break;
                case "long_side_shave":
                    active = horizontal > .24 && vertical > .1 && vertical < .95;
                    grade = .52 - horizontal * .62 + vertical * .08;
                    break;
                case "bixie":
                    active = side > .04 && vertical > .26 && vertical < .9;
                    grade = 1 - side * (.43 + .4 * nape);
                    break;
                case "tapered_twa":
                    active = (side > .03 || vertical > .58) && vertical > .1 && vertical < .95;
                    grade = 1 - .55 * side - .45 * nape;
                    break;
                case "bob_short_sides":
                    active = side > .12 && vertical > .3 && vertical < 1.05;
                    grade = .9 - .3 * side - .54 * nape;
                    break;
                case "curly_short_sides":
                    active = side > .11 && vertical > .08 && vertical < .95;
                    grade = 1 - .78 * side + .08 * Math.sin(vertical * 9);
                    break;
            }
            const index = y * width + x;
            zone[index] = active ? 1 : 0;
            score[index] = Math.max(0, Math.min(1, grade));
        }
    }
    return { zone, score };
}
function candidate(photo, coverage, texture) {
    const output = copy(photo.data);
    const stride = ["straight", "wavy", "curly", "coily"].indexOf(texture) + 1;
    for (let y = 0; y < photo.height; y++) {
        for (let x = 0; x < photo.width; x++) {
            const index = y * photo.width + x;
            if (coverage[index] <= .1)
                continue;
            const lattice = (x * (11 + stride * 2) + y * (7 + stride * 3)) % (9 + 2 * stride);
            const fibres = (x + y * stride) % (3 + stride);
            const grain = (lattice - (4 + stride)) * .7 + (fibres - (1 + stride / 2)) * .45;
            for (let channel = 0; channel < 3; channel++) {
                const offset = index * photo.channels + channel;
                const styled = photo.data[offset] * (.72 + stride * .015) + grain + 4;
                output[offset] = Math.trunc(Math.max(0, Math.min(255, styled)));
            }
        }
    }
    return output;
}
/** Public mask-limited pixel render for the hair-studio evidence gate. */
export function renderStyle(photo, hairMask, landmarks, styleId, level, options = {}) {
    validatePhoto(photo);
    const selected = checkedLevel(level);
    const lock = checkedLevel(options.lockLevel ?? DEFAULT_LOCK_LEVEL);
    if (!STYLES.includes(styleId))
        throw new RangeError("unsupported hairstyle");
    const texture = options.texture ?? "straight";
    if (!["straight", "wavy", "curly", "coily"].includes(texture))
        throw new RangeError("unsupported texture");
    validateMask(hairMask, photo, "hair_mask");
    if (options.sideMask !== undefined)
        validateMask(options.sideMask, photo, "side_mask");
    const coverage = new Float32Array(new ArrayBuffer(photo.width * photo.height * 4));
    if (!landmarks || !options.primaryFaceBox) {
        return {
            data: copy(photo.data), styleId, level: selected, rendered: false, changedPixelShare: 0,
            coverage, status: "no_mesh", guardCalled: false, blendedBack: false, simulationLabel: SIMULATION_LABEL,
        };
    }
    validateGeometry(landmarks);
    const [left, top, right, bottom] = options.primaryFaceBox;
    if (![left, top, right, bottom].every(Number.isFinite) ||
        !(0 <= left && left < right && right <= 1 && 0 <= top && top < bottom && bottom <= 1)) {
        throw new RangeError("invalid primary face box");
    }
    const { zone, score } = options.preparedZone ?? area(landmarks, photo.width, photo.height, styleId);
    const reveal = (selected - 1) / 4;
    for (let y = 0; y < photo.height; y++) {
        for (let x = 0; x < photo.width; x++) {
            const index = y * photo.width + x;
            const within = x >= left * photo.width && x < right * photo.width &&
                y >= top * photo.height && y < bottom * photo.height;
            const allowed = Math.max(hairMask[index], options.sideMask?.[index] ?? 0) * zone[index];
            coverage[index] = selected > 1 && within && score[index] <= reveal && allowed > .1 ? allowed : 0;
        }
    }
    const styled = candidate(photo, coverage, texture);
    const guard = options.identityGuard ?? new PixelChangeGuard();
    const decision = guard.guard(photo.data, styled, photo.channels, lock);
    if (decision.image.length !== photo.data.length)
        throw new RangeError("incompatible guarded image");
    const data = copy(decision.image);
    let changed = 0;
    for (let pixel = 0; pixel < coverage.length; pixel++) {
        const offset = pixel * photo.channels;
        if (coverage[pixel] === 0) {
            for (let channel = 0; channel < 3; channel++)
                data[offset + channel] = photo.data[offset + channel];
        }
        if ([0, 1, 2].some(channel => data[offset + channel] !== photo.data[offset + channel]))
            changed++;
        if (photo.channels === 4)
            data[offset + 3] = photo.data[offset + 3];
    }
    return {
        data, styleId, level: selected, rendered: true, changedPixelShare: changed / coverage.length,
        coverage, status: "rendered", guardCalled: true, blendedBack: decision.blendedBack,
        simulationLabel: SIMULATION_LABEL,
    };
}
/** Bounded geometry reuse; masks and guards are evaluated on every call. */
export class HairStyleSession {
    cached = new Map();
    maxStyles;
    zoneComputations = 0;
    constructor(maxStyles = 16) {
        if (!Number.isInteger(maxStyles) || maxStyles < 1 || maxStyles > 64) {
            throw new RangeError("cache capacity must be 1..64");
        }
        this.maxStyles = maxStyles;
    }
    clear() {
        this.cached.clear();
    }
    render(photo, hairMask, landmarks, styleId, level, options = {}) {
        if (landmarks === null)
            return renderStyle(photo, hairMask, landmarks, styleId, level, options);
        let photoDigest = 2166136261;
        for (const value of photo.data) {
            photoDigest = Math.imul(photoDigest ^ value, 16777619) >>> 0;
        }
        const photoId = `${photoDigest}:${photo.width}x${photo.height}:${styleId}:` +
            Object.values(landmarks).flat().join(",");
        let prepared = this.cached.get(photoId);
        if (prepared === undefined) {
            prepared = area(landmarks, photo.width, photo.height, styleId);
            if (this.cached.size >= this.maxStyles) {
                const first = this.cached.keys().next().value;
                if (first !== undefined)
                    this.cached.delete(first);
            }
            this.cached.set(photoId, prepared);
            this.zoneComputations++;
        }
        return renderStyle(photo, hairMask, landmarks, styleId, level, { ...options, preparedZone: prepared });
    }
}
