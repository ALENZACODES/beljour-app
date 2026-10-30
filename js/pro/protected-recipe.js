/** Private, source-bound recipe encryption without plaintext persistence. Author: John Khan. */
import { privateSourceBinding } from "./source-binding.js";
import { parseRecipe } from "./recipe.js";
import { serializeRecipe } from "./recipe.js";
import { openProtectedArtifact } from "../engines/upscale/protected-artifact.js";
import { sealProtectedArtifact } from "../engines/upscale/protected-artifact.js";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
/** Caller stores only the returned ciphertext; the original recipe remains in memory. */
export async function protectRecipe(recipe, sourceSha256, sessionSalt, keyId, key) {
    const binding = await privateSourceBinding(sourceSha256, sessionSalt);
    const plaintext = encoder.encode(serializeRecipe(recipe));
    try {
        return await sealProtectedArtifact(plaintext, "recipe", binding, keyId, key);
    }
    finally {
        plaintext.fill(0);
    }
}
/** Full JSON validation still runs after authentication, on the active source only. */
export async function restoreProtectedRecipe(encrypted, sourceSha256, sessionSalt, keyId, key) {
    const binding = await privateSourceBinding(sourceSha256, sessionSalt);
    const plaintext = await openProtectedArtifact(encrypted, "recipe", binding, keyId, key);
    try {
        return parseRecipe(decoder.decode(plaintext));
    }
    finally {
        plaintext.fill(0);
    }
}
//# sourceMappingURL=protected-recipe.js.map