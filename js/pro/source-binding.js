/** Ephemeral salted source binding, without storing a raw photo digest.
 * Author: John Khan.
 */
const HASH = /^[0-9a-f]{64}$/;
/** Keep this salt outside persistent storage and reuse it only with the same session key. */
export async function privateSourceBinding(sourceSha256, sessionSalt) {
    if (!HASH.test(sourceSha256) || !(sessionSalt instanceof Uint8Array) ||
        sessionSalt.length < 16 || sessionSalt.length > 64) {
        throw new RangeError("A private photo binding is required");
    }
    if (!globalThis.crypto?.subtle)
        throw new RangeError("Secure source binding unavailable");
    const bytes = new Uint8Array(sessionSalt.length + 64);
    bytes.set(sessionSalt);
    bytes.set(new TextEncoder().encode(sourceSha256), sessionSalt.length);
    try {
        const result = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, "0")).join("");
    }
    finally {
        bytes.fill(0);
    }
}
//# sourceMappingURL=source-binding.js.map