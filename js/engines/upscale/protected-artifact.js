/** Authenticated in-memory protection of private model and tuning bytes.
 * Author: John Khan.
 */
const MAGIC = new TextEncoder().encode("BLJRSEAL1");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_BYTES = 256 * 1024 * 1024;
const KEY_ID = /^[a-zA-Z0-9]{8,64}$/;
const HASH = /^[0-9a-f]{64}$/;
function cryptoProvider() {
    if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
        throw new RangeError("Protected model encryption unavailable");
    }
    return globalThis.crypto;
}
function verifyKey(key, usage) {
    const algorithm = key?.algorithm;
    if (!algorithm || algorithm.name !== "AES-GCM" || algorithm.length !== 256 ||
        key.extractable || key.type !== "secret" ||
        !key.usages.includes(usage)) {
        throw new RangeError("A non-extractable AES-256-GCM session key is required");
    }
}
function checkContext(kind, binding, keyId) {
    if (!["weights", "checkpoint", "tuning", "recipe"].includes(kind) ||
        !HASH.test(binding) || !KEY_ID.test(keyId)) {
        throw new RangeError("Invalid protected artifact binding");
    }
}
async function associatedData(kind, binding, keyId) {
    checkContext(kind, binding, keyId);
    const scope = new TextEncoder().encode(`beljour-private-artifact/1\0${kind}\0${keyId}\0`);
    const rawBinding = Uint8Array.from(binding.match(/../g), value => parseInt(value, 16));
    const digest = new Uint8Array(await cryptoProvider().subtle.digest("SHA-256", rawBinding.buffer));
    const bytes = new Uint8Array(scope.length + digest.length);
    bytes.set(scope);
    bytes.set(digest, scope.length);
    return bytes.buffer;
}
function packed(plain) {
    const copy = new Uint8Array(new ArrayBuffer(plain.byteLength));
    copy.set(plain);
    return copy.buffer;
}
export async function newSessionKey() {
    return cryptoProvider().subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function sealProtectedArtifact(plaintext, kind, binding, keyId, key) {
    verifyKey(key, "encrypt");
    if (!(plaintext instanceof Uint8Array) || !plaintext.byteLength ||
        plaintext.byteLength > MAX_BYTES) {
        throw new RangeError("Protected artifact payload is empty or oversized");
    }
    const additionalData = await associatedData(kind, binding, keyId);
    const nonce = cryptoProvider().getRandomValues(new Uint8Array(NONCE_BYTES));
    const output = await cryptoProvider().subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData, tagLength: 128 }, key, packed(plaintext));
    const ciphertext = new Uint8Array(MAGIC.length + NONCE_BYTES + output.byteLength);
    ciphertext.set(MAGIC);
    ciphertext.set(nonce, MAGIC.length);
    ciphertext.set(new Uint8Array(output), MAGIC.length + NONCE_BYTES);
    return { format: "beljour-protected-artifact/1", kind, binding, keyId, ciphertext };
}
export async function openProtectedArtifact(artifact, kind, binding, keyId, key) {
    verifyKey(key, "decrypt");
    await associatedData(kind, binding, keyId);
    if (!artifact || artifact.format !== "beljour-protected-artifact/1" ||
        artifact.kind !== kind || artifact.keyId !== keyId || artifact.binding !== binding ||
        !(artifact.ciphertext instanceof Uint8Array)) {
        throw new RangeError("Protected artifact context mismatch");
    }
    const bytes = artifact.ciphertext;
    if (bytes.length <= MAGIC.length + NONCE_BYTES + TAG_BYTES ||
        bytes.length > MAGIC.length + NONCE_BYTES + MAX_BYTES + TAG_BYTES ||
        MAGIC.some((value, index) => bytes[index] !== value)) {
        throw new RangeError("Malformed protected artifact envelope");
    }
    const nonce = packed(bytes.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES));
    const payload = packed(bytes.subarray(MAGIC.length + NONCE_BYTES));
    const additionalData = await associatedData(kind, binding, keyId);
    let decrypted;
    try {
        decrypted = await cryptoProvider().subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData, tagLength: 128 }, key, payload);
    }
    catch {
        throw new RangeError("Protected artifact authentication failed");
    }
    if (!decrypted.byteLength || decrypted.byteLength > MAX_BYTES) {
        new Uint8Array(decrypted).fill(0);
        throw new RangeError("Invalid decrypted artifact size");
    }
    return new Uint8Array(decrypted);
}
export async function withProtectedArtifact(artifact, kind, binding, keyId, key, consumer) {
    const plain = await openProtectedArtifact(artifact, kind, binding, keyId, key);
    try {
        return await consumer(plain);
    }
    finally {
        plain.fill(0);
    }
}
//# sourceMappingURL=protected-artifact.js.map