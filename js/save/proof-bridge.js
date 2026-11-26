/** Versioned saved-look proof adapter with one transient photo reader.
 *
 * The bridge reads a saved recipe only on a user-triggered proof check. It
 * does not persist or expose photo pixels; an application-owned epoch makes
 * old runs stale when the editor opens or updates a different source. A blocked
 * IndexedDB read becomes an unavailable check, not a spurious success.
 * Author: John Khan.
 */
import { downloadLocalReceipt } from "./proof-download.js";
import { mountProofWidget } from "./proof-widget.js";
function checkedRevision(photo) {
    const value = photo.revision();
    if (!Number.isSafeInteger(value) || value < 0)
        throw new TypeError("invalid editor revision");
    return value;
}
function checkId(value) {
    if (typeof value !== "string" || !/^look-[0-9a-f]{8}$/i.test(value)) {
        throw new TypeError("saved look reference is invalid");
    }
    return value;
}
function checkedPhoto(photo) {
    if (!photo || !Number.isSafeInteger(photo.width) || !Number.isSafeInteger(photo.height) ||
        (photo.channels !== 3 && photo.channels !== 4) ||
        !(photo.data instanceof Uint8Array || photo.data instanceof Uint8ClampedArray) ||
        photo.width < 1 || photo.height < 1 || photo.width * photo.height > 16_777_216 ||
        photo.data.length !== photo.width * photo.height * photo.channels) {
        throw new TypeError("unavailable photo for local proof");
    }
    return photo;
}
/** A proof checks the latest saved version; no photo or person identifier enters a receipt. */
export async function resolveSavedProof(options) {
    const id = options.id();
    if (id === null)
        return null;
    const key = checkId(id);
    const epoch = checkedRevision(options.photo);
    const look = await options.library.get(key);
    if (checkedRevision(options.photo) !== epoch)
        return null;
    if (!look)
        return null;
    const batch = {
        declared: 1,
        available: 1,
        revision: () => checkedRevision(options.photo),
        async read(index) {
            if (index !== 0)
                throw new RangeError("saved look has one current photo");
            if (checkedRevision(options.photo) !== epoch)
                throw new Error("photo changed during proof");
            const original = checkedPhoto(await options.photo.read());
            if (checkedRevision(options.photo) !== epoch)
                throw new Error("photo changed during proof");
            const encoded = options.photo.encoded ? await options.photo.encoded() : null;
            if (checkedRevision(options.photo) !== epoch)
                throw new Error("photo changed during export proof");
            if (encoded !== null && encoded !== undefined && !(encoded instanceof Uint8Array)) {
                throw new TypeError("invalid encoded local output");
            }
            return encoded ? { pixels: original, encoded } : { pixels: original };
        },
    };
    return { recipe: look, batch, engine: options.engine };
}
/** Pluggable browser UI; Save layout owners can mount without editing proof logic. */
export function mountSavedLookProof(root, options) {
    let currentId = null;
    const reader = async () => {
        const selected = options.id();
        const result = await resolveSavedProof(options);
        currentId = result && selected !== null ? checkId(selected) : null;
        return result;
    };
    const deliver = options.deliverReceipt ?? (async (name, text) => {
        if (!currentId)
            throw new Error("proof recipe is no longer available");
        const current = await options.library.get(currentId);
        if (!current || await downloadLocalReceipt(name, text, current) !== "downloaded") {
            throw new Error("local proof receipt is unavailable");
        }
    });
    return mountProofWidget(root, {
        readSource: reader,
        deliverReceipt: deliver,
        title: "Verify saved look locally",
    });
}
//# sourceMappingURL=proof-bridge.js.map