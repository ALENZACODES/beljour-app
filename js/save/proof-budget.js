/** Bounded local proof input reader for resource-constrained browsers.
 *
 * A proof may already use two full RGBA frames for deterministic replay.
 * This wrapper rejects oversized inputs before a renderer runs and reports
 * only byte and image counts. It neither resizes photos nor uploads data.
 * Author: John Khan.
 */
export const BUDGET_FORMAT = "beljour-save-proof-budget/1";
export const DEFAULT_PROOF_LIMITS = {
    frameBytes: 64 * 1024 * 1024,
    totalReadBytes: 256 * 1024 * 1024,
    encodedBytes: 64 * 1024 * 1024,
};
function bound(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_073_741_824;
}
function checkedLimits(input) {
    if (!input || !bound(input.frameBytes) || !bound(input.totalReadBytes) || !bound(input.encodedBytes) ||
        input.frameBytes < 1 || input.totalReadBytes < input.frameBytes || input.encodedBytes < 1) {
        throw new RangeError("invalid local proof resource limits");
    }
    return { frameBytes: input.frameBytes, totalReadBytes: input.totalReadBytes, encodedBytes: input.encodedBytes };
}
function dimensions(input) {
    const photo = input.pixels;
    const width = photo.width;
    const height = photo.height;
    const channels = photo.channels;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
        (channels !== 3 && channels !== 4) || width * height > 16_777_216 ||
        !(photo.data instanceof Uint8Array || photo.data instanceof Uint8ClampedArray) ||
        photo.data.length !== width * height * channels) {
        throw new TypeError("invalid photo buffer for proof budget");
    }
    return photo.data.byteLength;
}
/**
 * A wrapper with no source image retained after a read. It does not claim
 * measured peak heap, GPU memory, mobile latency, or 12 MP export speed.
 */
export class BudgetedProofSource {
    inner;
    declared;
    available;
    inspected = 0;
    bytesRead = 0;
    largestFrameBytes = 0;
    largestExportBytes = 0;
    limits;
    constructor(inner, limits = DEFAULT_PROOF_LIMITS) {
        this.inner = inner;
        this.declared = inner.declared;
        this.available = inner.available;
        this.limits = checkedLimits(limits);
    }
    revision() {
        return this.inner.revision?.() ?? 0;
    }
    async read(index) {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.available) {
            throw new RangeError("budget proof slot outside declared source");
        }
        const input = await this.inner.read(index);
        const bytes = dimensions(input);
        if (input.encoded !== undefined && !(input.encoded instanceof Uint8Array)) {
            throw new TypeError("unsupported local encoded output");
        }
        const exported = input.encoded?.byteLength ?? 0;
        if (bytes > this.limits.frameBytes || exported > this.limits.encodedBytes ||
            this.bytesRead + bytes + exported > this.limits.totalReadBytes) {
            throw new RangeError("local proof exceeds configured input byte budget");
        }
        this.inspected++;
        this.bytesRead += bytes + exported;
        this.largestFrameBytes = Math.max(this.largestFrameBytes, bytes);
        this.largestExportBytes = Math.max(this.largestExportBytes, exported);
        return input;
    }
    report() {
        return {
            format: BUDGET_FORMAT,
            inspected: this.inspected,
            bytesRead: this.bytesRead,
            largestFrameBytes: this.largestFrameBytes,
            largestExportBytes: this.largestExportBytes,
            status: this.inspected ? "within_inputs" : "unmeasured_device_peak",
        };
    }
}
export function validateProofBudget(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new TypeError("invalid budget summary");
    const obj = raw;
    const keys = ["format", "inspected", "bytesRead", "largestFrameBytes", "largestExportBytes", "status"];
    if (Object.keys(obj).length !== keys.length || keys.some((key) => !Object.hasOwn(obj, key))) {
        throw new TypeError("budget fields differ");
    }
    for (const key of ["inspected", "bytesRead", "largestFrameBytes", "largestExportBytes"]) {
        if (!bound(obj[key]))
            throw new TypeError("invalid proof byte counts");
    }
    if (obj.format !== BUDGET_FORMAT || !["within_inputs", "unmeasured_device_peak"].includes(String(obj.status)) ||
        (obj.inspected === 0 && obj.status !== "unmeasured_device_peak") ||
        (obj.inspected !== 0 && obj.status !== "within_inputs") ||
        obj.largestFrameBytes + obj.largestExportBytes > obj.bytesRead) {
        throw new TypeError("unverifiable proof memory budget summary");
    }
    return obj;
}
//# sourceMappingURL=proof-budget.js.map