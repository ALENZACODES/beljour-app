import { DEFAULT_POSTURE_LEVEL, DEFAULT_POSTURE_LOCK, FACE_MOVING_FIXES, SIMULATION_LABEL, bodyBand, checkedPostureLevel, postureLevelPlan, renderPosture } from "../engines/local/posture.js";
export class IdentityLockUnavailable extends RangeError {
}
const MAX_PHOTOS = 4;
const MAX_PLANS = 40;
const PREVIEW_MAX_EDGE = 512;
const FACE_IDENTITY_FLOOR = 0.95;
const LOWER_LOCK_FLOOR = 0.8;
export function posturePreviewSize(width, height, released) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 8 && height >= 8 && width <= 16384 && height <= 16384)) {
        throw new RangeError("invalid photo dimensions");
    }
    const scale = released ? 1 : Math.min(1, PREVIEW_MAX_EDGE / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)),
        scale, fullResolution: released };
}
function checkedHash(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash))
        throw new RangeError("photo hash must be 64 lowercase hexadecimal characters");
}
function copyImage(image) {
    return { ...image, data: new Uint8Array(image.data) };
}
function copyMask(mask) {
    return { ...mask, data: new Float32Array(mask.data) };
}
export function postureIdentityFloor(level) {
    return LOWER_LOCK_FLOOR + (FACE_IDENTITY_FLOOR - LOWER_LOCK_FLOOR) * (checkedPostureLevel(level) - 1) / 4;
}
/** Default-on for face-adjacent edits. Missing guards fail closed, not pass through. */
export function guardedPostureRender(image, person, controls, fix, level = DEFAULT_POSTURE_LEVEL, guard = null, lockLevel = DEFAULT_POSTURE_LOCK) {
    const checkedLock = checkedPostureLevel(lockLevel);
    const touchesFace = FACE_MOVING_FIXES.has(fix);
    if (touchesFace && !guard)
        throw new IdentityLockUnavailable("Identity lock is required for this face-adjacent edit.");
    const p = postureLevelPlan(controls, fix, level);
    const outcome = renderPosture(image, person, p, { fillMethod: "none" });
    if (!touchesFace)
        return { image: copyImage(outcome.image), outcome, similarity: null,
            identityRecovered: false, lockLevel: checkedLock, label: SIMULATION_LABEL };
    if (!guard)
        throw new IdentityLockUnavailable("Identity lock is required for this face-adjacent edit.");
    const decision = guard.guard(copyImage(image), copyImage(outcome.image), checkedLock);
    if (decision.image.width !== image.width || decision.image.height !== image.height ||
        decision.image.channels !== image.channels || decision.image.data.length !== image.data.length) {
        throw new IdentityLockUnavailable("Identity guard returned an incompatible image.");
    }
    if (!(Number.isFinite(decision.similarity) && decision.similarity >= 0 && decision.similarity <= 1)) {
        throw new IdentityLockUnavailable("Identity guard returned invalid similarity.");
    }
    const restored = decision.similarity < postureIdentityFloor(checkedLock);
    return { image: restored ? copyImage(image) : copyImage(decision.image), outcome,
        similarity: decision.similarity, identityRecovered: restored, lockLevel: checkedLock, label: SIMULATION_LABEL };
}
export class PosturePhotoCache {
    maxBandBytes;
    controlsCache = new Map();
    planCache = new Map();
    bands = new Map();
    bandSize = 0;
    constructor(maxBandBytes = 32 * 1024 * 1024) {
        this.maxBandBytes = maxBandBytes;
        if (maxBandBytes < 1024)
            throw new RangeError("cache budget is too small");
    }
    controls(photoHash, factory) {
        checkedHash(photoHash);
        const cached = this.controlsCache.get(photoHash);
        if (cached)
            return cached;
        const result = factory();
        this.controlsCache.set(photoHash, result);
        while (this.controlsCache.size > MAX_PHOTOS) {
            const oldest = this.controlsCache.keys().next().value;
            if (oldest === undefined)
                break;
            this.controlsCache.delete(oldest);
            for (const key of [...this.planCache.keys()])
                if (key.startsWith(`${oldest}:`))
                    this.planCache.delete(key);
            for (const key of [...this.bands.keys()]) {
                if (key.startsWith(`${oldest}:`)) {
                    this.bandSize -= this.bands.get(key).data.byteLength;
                    this.bands.delete(key);
                }
            }
        }
        return result;
    }
    plan(photoHash, fix, level, factory) {
        const validated = checkedPostureLevel(level);
        const controls = this.controls(photoHash, factory);
        const key = `${photoHash}:${fix}:${validated.toFixed(1)}`;
        const prior = this.planCache.get(key);
        if (prior)
            return prior;
        const result = postureLevelPlan(controls, fix, validated);
        this.planCache.set(key, result);
        if (this.planCache.size > MAX_PLANS)
            this.planCache.delete(this.planCache.keys().next().value);
        return result;
    }
    band(photoHash, fix, factory) {
        checkedHash(photoHash);
        const key = `${photoHash}:${fix}`;
        const prior = this.bands.get(key);
        if (prior)
            return copyMask(prior);
        const result = bodyBand(factory()).band;
        if (result.data.byteLength > this.maxBandBytes)
            throw new RangeError("body band exceeds the memory budget");
        while (this.bandSize + result.data.byteLength > this.maxBandBytes && this.bands.size) {
            const oldest = this.bands.keys().next().value;
            if (oldest === undefined)
                break;
            this.bandSize -= this.bands.get(oldest).data.byteLength;
            this.bands.delete(oldest);
        }
        this.bands.set(key, copyMask(result));
        this.bandSize += result.data.byteLength;
        return copyMask(result);
    }
    invalidatePhoto(photoHash) {
        checkedHash(photoHash);
        this.controlsCache.delete(photoHash);
        for (const key of [...this.planCache.keys()]) {
            if (key.startsWith(`${photoHash}:`))
                this.planCache.delete(key);
        }
        for (const key of [...this.bands.keys()]) {
            if (key.startsWith(`${photoHash}:`)) {
                this.bandSize -= this.bands.get(key).data.byteLength;
                this.bands.delete(key);
            }
        }
    }
    clear() {
        this.controlsCache.clear();
        this.planCache.clear();
        this.bands.clear();
        this.bandSize = 0;
    }
    get bandBytes() { return this.bandSize; }
    get plans() { return this.planCache.size; }
}
