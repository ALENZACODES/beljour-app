/** Optional same-file confirmation using a local picker, never an upload. */
/** Author: John Khan. */
import { inspectExportedPng } from "./export-png.js";
const RECEIPT_LIMIT = 48 * 1024 * 1024;
const VALID_DIGEST = /^[0-9a-f]{64}$/;
const NOTES = {
    empty: "No validated PNG request has been made.",
    preparing: "Preparing a private, local checksum for optional file confirmation.",
    ready: "Choose the downloaded PNG to confirm its exact bytes locally.",
    checking: "Checking the selected file on this device. Nothing is uploaded.",
    matched: "The selected local file exactly matches the PNG requested for download.",
    mismatch: "The selected local file differs. No download receipt was established.",
    refused: "Local file confirmation was unavailable or refused.",
    disposed: "The local file comparison has ended.",
};
async function browserDigest(blob) {
    if (!globalThis.crypto?.subtle)
        throw new Error("Secure local digest unavailable");
    if (blob.size < 57 || blob.size > RECEIPT_LIMIT) {
        throw new RangeError("File outside digest bounds");
    }
    const bytes = await blob.arrayBuffer();
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
function sameDigest(left, right) {
    if (!VALID_DIGEST.test(left) || !VALID_DIGEST.test(right))
        return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
}
function report(phase) {
    return Object.freeze({
        phase,
        message: NOTES[phase],
        available: ["ready", "checking", "matched", "mismatch"].includes(phase),
        exactFileConfirmed: phase === "matched",
        usedNetwork: false,
        storesImages: false,
    });
}
/** Only a 32-byte digest and public dimensions survive the digest operation. */
export class LocalExportReceipt {
    digester;
    changed;
    generation = 0;
    inFlight = 0;
    status = report("empty");
    expectedHash = null;
    expected = null;
    disposed = false;
    constructor(port = { digest: browserDigest }, onChange) {
        this.digester = port;
        this.changed = onChange ?? null;
    }
    get snapshot() {
        return report(this.status.phase);
    }
    set(phase) {
        this.status = report(phase);
        this.changed?.();
        return this.snapshot;
    }
    async stage(blob, context) {
        if (this.disposed)
            return this.snapshot;
        if (this.inFlight >= 2)
            return this.set("refused");
        this.invalidate();
        const token = ++this.generation;
        if (blob.size !== context.size || blob.size > RECEIPT_LIMIT) {
            return this.set("refused");
        }
        if (!Number.isSafeInteger(context.width) || !Number.isSafeInteger(context.height)
            || context.width < 1 || context.height < 1) {
            return this.set("refused");
        }
        this.inFlight += 1;
        this.set("preparing");
        try {
            await inspectExportedPng(blob, context.width, context.height);
            const digest = await this.digester.digest(blob);
            if (this.disposed || token !== this.generation)
                return this.snapshot;
            if (!VALID_DIGEST.test(digest))
                return this.set("refused");
            this.expectedHash = digest;
            this.expected = { ...context };
            return this.set("ready");
        }
        catch {
            if (this.disposed || token !== this.generation)
                return this.snapshot;
            this.expectedHash = null;
            this.expected = null;
            return this.set("refused");
        }
        finally {
            this.inFlight -= 1;
        }
    }
    async check(file) {
        if (this.disposed || !this.expected || !this.expectedHash
            || this.status.phase === "checking" || this.inFlight >= 2) {
            return this.snapshot;
        }
        if (!(file instanceof Blob) || file.size !== this.expected.size
            || file.size > RECEIPT_LIMIT) {
            return this.set("mismatch");
        }
        const token = ++this.generation;
        const width = this.expected.width;
        const height = this.expected.height;
        this.inFlight += 1;
        this.set("checking");
        try {
            await inspectExportedPng(file, width, height);
            const actual = await this.digester.digest(file);
            if (this.disposed || token !== this.generation)
                return this.snapshot;
            return this.set(sameDigest(actual, this.expectedHash) ? "matched" : "mismatch");
        }
        catch {
            if (this.disposed || token !== this.generation)
                return this.snapshot;
            return this.set("refused");
        }
        finally {
            this.inFlight -= 1;
        }
    }
    invalidate() {
        if (this.disposed)
            return;
        this.generation += 1;
        this.expectedHash = null;
        this.expected = null;
        this.set("empty");
    }
    dispose() {
        if (this.disposed)
            return;
        this.invalidate();
        this.disposed = true;
        this.status = report("disposed");
    }
}
//# sourceMappingURL=export-receipt.js.map