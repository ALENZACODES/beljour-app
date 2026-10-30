/** Encrypted posture history recovery; no readable edit records at rest.
 * Author: John Khan.
 */
import { privateSourceBinding } from "../pro/source-binding.js";
import { openProtectedArtifact } from "../engines/upscale/protected-artifact.js";
import { sealProtectedArtifact } from "../engines/upscale/protected-artifact.js";
const SCHEMA = "beljour-private-history/1";
const MAX_BYTES = 65536;
const HEX = /^[0-9a-f]+$/;
function toHex(bytes) {
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
function fromHex(text) {
    if (text.length > MAX_BYTES * 2 || text.length % 2 !== 0 || !HEX.test(text)) {
        throw new RangeError("Invalid encrypted history encoding");
    }
    return Uint8Array.from(text.match(/../g), part => Number.parseInt(part, 16));
}
function checkedStoreKey(key) {
    if (!/^[a-z0-9:_-]{1,64}$/.test(key))
        throw new RangeError("Invalid recovery key");
}
export async function saveProtectedPostureHistory(store, storageKey, sourceHash, sessionSalt, history, keyId, key) {
    checkedStoreKey(storageKey);
    const binding = await privateSourceBinding(sourceHash, sessionSalt);
    const settings = history.exportSettings(sourceHash);
    const plaintext = new TextEncoder().encode(JSON.stringify({
        schema: SCHEMA, entries: settings.entries, cursor: settings.cursor,
    }));
    try {
        const sealed = await sealProtectedArtifact(plaintext, "tuning", binding, keyId, key);
        const record = JSON.stringify({
            format: sealed.format, kind: sealed.kind, keyId: sealed.keyId,
            binding: sealed.binding, encrypted: toHex(sealed.ciphertext),
        });
        if (record.length > MAX_BYTES)
            throw new RangeError("Encrypted history is oversized");
        store.setItem(storageKey, record);
    }
    finally {
        plaintext.fill(0);
    }
}
export async function restoreProtectedPostureHistory(store, storageKey, sourceHash, sessionSalt, history, keyId, key) {
    checkedStoreKey(storageKey);
    const raw = store.getItem(storageKey);
    if (raw === null)
        return false;
    if (raw.length > MAX_BYTES)
        throw new RangeError("Encrypted history is oversized");
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new RangeError("Invalid encrypted history record");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new RangeError("Invalid encrypted history record");
    }
    const fields = parsed;
    if (Object.keys(fields).sort().join(",") !==
        "binding,encrypted,format,keyId,kind" || typeof fields.encrypted !== "string" ||
        typeof fields.keyId !== "string" || typeof fields.binding !== "string") {
        throw new RangeError("Invalid encrypted history record");
    }
    const binding = await privateSourceBinding(sourceHash, sessionSalt);
    const artifact = {
        format: fields.format,
        kind: fields.kind,
        keyId: fields.keyId,
        binding: fields.binding,
        ciphertext: fromHex(fields.encrypted),
    };
    const decrypted = await openProtectedArtifact(artifact, "tuning", binding, keyId, key);
    try {
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decrypted));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new RangeError("Invalid decrypted history");
        }
        const payload = value;
        if (Object.keys(payload).sort().join(",") !== "cursor,entries,schema" ||
            payload.schema !== SCHEMA || !Array.isArray(payload.entries) ||
            typeof payload.cursor !== "number") {
            throw new RangeError("Invalid decrypted history");
        }
        history.restoreSettings(sourceHash, {
            entries: payload.entries, cursor: payload.cursor,
        });
        return true;
    }
    finally {
        decrypted.fill(0);
    }
}
//# sourceMappingURL=posture-history-protected.js.map