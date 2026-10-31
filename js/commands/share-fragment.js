/** Settings-only Pro recipes in bounded local URL fragments.
 * No image bytes, personal identifiers, model weights or upload transport.
 * The canonical checksum detects changes; it does not authenticate the author.
 * Author: John Khan.
 */
import { ProPlanError } from './plan.js';
import { exportPortableProRecipe, importPortableProRecipe } from './portable-recipe.js';
const PREFIX = '#pro=';
const MAX_SHARE_LENGTH = 11000;
const SAFE_BASE64URL = /^[a-zA-Z0-9_-]+$/;
function fail(code, message) {
    throw new ProPlanError(code, message);
}
function binaryEncode(bytes) {
    let binary = '';
    for (const value of bytes)
        binary += String.fromCharCode(value);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function binaryDecode(text) {
    if (!SAFE_BASE64URL.test(text) || text.length % 4 === 1) {
        return fail('invalid_share_encoding', 'Share fragment is not base64url.');
    }
    const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
    let binary;
    try {
        binary = atob(normalized + '='.repeat((4 - text.length % 4) % 4));
    }
    catch {
        return fail('invalid_share_encoding', 'Share fragment is not base64url.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    if (binaryEncode(bytes) !== text) {
        return fail('invalid_share_encoding', 'Share encoding is not canonical.');
    }
    return bytes;
}
export async function exportProShareFragment(plan) {
    const document = await exportPortableProRecipe(plan);
    const encoded = binaryEncode(new TextEncoder().encode(document));
    const result = PREFIX + encoded;
    if (result.length > MAX_SHARE_LENGTH) {
        return fail('invalid_share_size', 'Share fragment exceeds its safe limit.');
    }
    return result;
}
export async function importProShareFragment(fragment, options = {}) {
    if (typeof fragment !== 'string' || fragment.length === 0 ||
        fragment.length > MAX_SHARE_LENGTH) {
        return fail('invalid_share_fragment', 'Share fragment must be bounded.');
    }
    if (!fragment.startsWith(PREFIX)) {
        return fail('invalid_share_prefix', 'Share fragment must begin with #pro=.');
    }
    const encoded = fragment.slice(PREFIX.length);
    const bytes = binaryDecode(encoded);
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        return fail('invalid_share_encoding', 'Share fragment does not contain UTF-8.');
    }
    return importPortableProRecipe(text, options);
}
