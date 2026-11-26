/** Explicit local companion manifest preparation, no service or provider dependency. */
/** Author: John Khan. */
import { verifyPngBytes } from "./export-png.js";
import { OFFLINE_IMPORT_FORMAT, OFFLINE_IMPORT_MAX_PNG, checkedOfflineImportManifest, } from "./offline-import-contract.js";
const DEFAULT_DIGEST = {
    async digest(bytes) {
        if (!globalThis.crypto?.subtle)
            throw new Error("Local digest is unavailable");
        const copied = new Uint8Array(bytes);
        const value = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", copied));
        return Array.from(value, (item) => item.toString(16).padStart(2, "0")).join("");
    },
};
function pngDimension(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.byteLength)
        throw new RangeError("Truncated image header");
    return ((bytes[offset] * 16777216) + (bytes[offset + 1] * 65536)
        + (bytes[offset + 2] * 256) + bytes[offset + 3]) >>> 0;
}
function approvedFamily(value) {
    if (value !== "hair" && value !== "makeup" && value !== "skin") {
        throw new RangeError("Select a supported local replay category");
    }
    return value;
}
/** A prepared manifest states only a byte hash and unverified origin. */
export async function prepareOfflineReplayManifest(png, family, port = DEFAULT_DIGEST) {
    if (!(png instanceof Blob) || png.type !== "image/png"
        || png.size < 57 || png.size > OFFLINE_IMPORT_MAX_PNG) {
        throw new RangeError("Only a bounded local PNG can be prepared");
    }
    const selectedFamily = approvedFamily(family);
    const bytes = new Uint8Array(await png.arrayBuffer());
    if (bytes.byteLength !== png.size)
        throw new RangeError("PNG bytes changed during preparation");
    const width = pngDimension(bytes, 16);
    const height = pngDimension(bytes, 20);
    verifyPngBytes(bytes, width, height);
    const sha256 = await port.digest(bytes);
    return checkedOfflineImportManifest({
        format: OFFLINE_IMPORT_FORMAT,
        family: selectedFamily,
        mediaType: "image/png",
        width,
        height,
        size: bytes.byteLength,
        sha256,
        source: "operator-supplied-unverified",
        scene: "drawn-pair",
        providerVerified: false,
        realFaceTested: false,
        unitsSpentByViewer: 0,
    });
}
/** The companion JSON contains a photo fingerprint but never original pixels. */
export function preparedManifestBlob(manifest) {
    const checked = checkedOfflineImportManifest(manifest);
    return new Blob([JSON.stringify(checked)], { type: "application/json" });
}
/** A download occurs only after a visitor-initiated native button action. */
export function downloadPreparedManifest(doc, json) {
    if (!(json instanceof Blob) || json.type !== "application/json"
        || json.size > 8192 || json.size < 40) {
        throw new RangeError("Local manifest cannot be downloaded");
    }
    const url = URL.createObjectURL(json);
    try {
        if (!/^blob:[^\s]{1,2048}$/.test(url))
            throw new RangeError("Invalid local download URL");
        const anchor = doc.createElement("a");
        anchor.href = url;
        anchor.download = "BELJOUR-FULL-BEAUTY-STUDIO-local-replay.json";
        anchor.rel = "noopener";
        anchor.click();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
//# sourceMappingURL=offline-import-preparation.js.map