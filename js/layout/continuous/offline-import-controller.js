/** Local integrity check and ephemeral preview for operator-supplied PNGs. Author: John Khan. */
import { verifyPngBytes } from "./export-png.js";
import { OFFLINE_IMPORT_MAX_PNG, offlineImportAuthority, offlineImportStatus, parseOfflineManifest, sameOfflineImportAuthority, } from "./offline-import-contract.js";
const VALID_DIGEST = /^[0-9a-f]{64}$/;
const browserDigest = {
    async digest(bytes) {
        if (!globalThis.crypto?.subtle)
            throw new Error("Local digest unavailable");
        const copy = new Uint8Array(bytes);
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", copy));
        return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
    },
};
const browserUrls = {
    create(blob) {
        return URL.createObjectURL(blob);
    },
    revoke(url) {
        URL.revokeObjectURL(url);
    },
};
function equalDigest(expected, actual) {
    if (!VALID_DIGEST.test(expected) || !VALID_DIGEST.test(actual))
        return false;
    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) {
        mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
    }
    return mismatch === 0;
}
function safeUrl(url) {
    return typeof url === "string" && /^blob:[^\s]{1,2048}$/.test(url)
        && !/[<>"']/.test(url);
}
/** No image, filename or external URI appears in snapshot/report data. */
export class OfflineImportController {
    current;
    notify;
    hasher;
    urls;
    phase = "empty";
    manifest = null;
    authority = null;
    objectUrl = null;
    revision = 0;
    activeReads = 0;
    disposed = false;
    constructor(ports) {
        this.current = ports.current;
        this.notify = ports.onChange ?? null;
        this.hasher = ports.digest ?? browserDigest;
        this.urls = ports.urls ?? browserUrls;
    }
    get snapshot() {
        this.refreshAuthority();
        return offlineImportStatus(this.phase, this.manifest);
    }
    /** A blob URL can be used only by the local preview element, never by a report. */
    get previewUrl() {
        this.refreshAuthority();
        return this.phase === "ready" ? this.objectUrl : null;
    }
    get outstandingReads() {
        return this.activeReads;
    }
    setPhase(next) {
        this.phase = next;
        this.notify?.();
        return offlineImportStatus(next, this.manifest);
    }
    dropPreview() {
        if (!this.objectUrl)
            return;
        const old = this.objectUrl;
        this.objectUrl = null;
        try {
            this.urls.revoke(old);
        }
        catch {
            // URL cleanup is best effort; revoked references are never reused.
        }
    }
    clearInternal(next) {
        this.revision += 1;
        this.dropPreview();
        this.manifest = null;
        this.authority = null;
        this.setPhase(next);
    }
    refreshAuthority() {
        if (this.disposed || !this.authority)
            return;
        if (this.phase !== "ready" && this.phase !== "checking")
            return;
        const current = this.current();
        const latest = offlineImportAuthority(current.state, current.drawn, this.authority.family);
        if (!sameOfflineImportAuthority(this.authority, latest)) {
            this.clearInternal("stale");
        }
    }
    /** Stale reads cannot create a preview or count toward an accepted outcome. */
    async load(manifestBlob, pngBlob) {
        if (this.disposed)
            return offlineImportStatus("disposed");
        this.clearInternal("empty");
        const token = this.revision;
        if (!(manifestBlob instanceof Blob) || !(pngBlob instanceof Blob)
            || pngBlob.type !== "image/png" || pngBlob.size < 57
            || pngBlob.size > OFFLINE_IMPORT_MAX_PNG || this.activeReads >= 2) {
            return this.setPhase("refused");
        }
        this.activeReads += 1;
        this.setPhase("checking");
        try {
            const manifest = await parseOfflineManifest(manifestBlob);
            if (this.disposed || token !== this.revision)
                return this.snapshot;
            const current = this.current();
            const authority = offlineImportAuthority(current.state, current.drawn, manifest.family);
            if (!authority || pngBlob.size !== manifest.size) {
                return this.setPhase("refused");
            }
            this.authority = authority;
            const bytes = new Uint8Array(await pngBlob.arrayBuffer());
            if (bytes.byteLength !== pngBlob.size)
                throw new RangeError("Local PNG changed during inspection");
            verifyPngBytes(bytes, manifest.width, manifest.height);
            const digest = await this.hasher.digest(bytes);
            if (this.disposed || token !== this.revision)
                return this.snapshot;
            const latest = this.current();
            const checked = offlineImportAuthority(latest.state, latest.drawn, manifest.family);
            if (!sameOfflineImportAuthority(authority, checked)) {
                this.clearInternal("stale");
                return this.snapshot;
            }
            if (!equalDigest(manifest.sha256, digest))
                return this.setPhase("refused");
            const url = this.urls.create(pngBlob);
            if (!safeUrl(url)) {
                try {
                    this.urls.revoke(url);
                }
                catch {
                    // No invalid preview URL is retained.
                }
                return this.setPhase("refused");
            }
            if (this.disposed || token !== this.revision) {
                this.urls.revoke(url);
                return this.snapshot;
            }
            this.objectUrl = url;
            this.manifest = manifest;
            return this.setPhase("ready");
        }
        catch {
            if (this.disposed || token !== this.revision)
                return this.snapshot;
            this.dropPreview();
            this.manifest = null;
            return this.setPhase("refused");
        }
        finally {
            this.activeReads -= 1;
        }
    }
    /** Withdrawn consent, changed edits or navigation instantly revoke preview access. */
    invalidate() {
        if (this.disposed)
            return;
        this.clearInternal("empty");
    }
    dispose() {
        if (this.disposed)
            return;
        this.clearInternal("empty");
        this.disposed = true;
        this.phase = "disposed";
    }
}
//# sourceMappingURL=offline-import-controller.js.map