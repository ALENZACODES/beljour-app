/** Offline export/import of settings-only command recipes.
 * No image, model, landmark or user file metadata can enter a recipe.
 * No storage or remote transmission is performed by this module.
 * Author: John Khan.
 */
import { ProPlanError } from './plan.js';
import { MAX_PORTABLE_RECIPE_BYTES, exportPortableProRecipe, importPortableProRecipe, } from './portable-recipe.js';
export const PORTABLE_FILENAME = 'beljour-pro-recipe.json';
const JSON_TYPE = 'application/json';
const RECIPE_TYPES = new Set(['application/json', 'text/plain', '']);
function validateFilename(name) {
    if (typeof name !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.json$/.test(name) ||
        name.startsWith('.') || name.includes('..')) {
        throw new ProPlanError('invalid_recipe_filename', 'Recipe download name is invalid.');
    }
}
function validateFile(file) {
    if (file === null || typeof file !== 'object' ||
        !Number.isInteger(file.size) || file.size < 1 ||
        file.size > MAX_PORTABLE_RECIPE_BYTES ||
        !RECIPE_TYPES.has(file.type) || typeof file.text !== 'function') {
        throw new ProPlanError('invalid_recipe_file', 'Select a small JSON recipe file.');
    }
}
export async function readLocalRecipe(file, options = {}) {
    validateFile(file);
    let text;
    try {
        text = await file.text();
    }
    catch {
        throw new ProPlanError('recipe_read_failed', 'Local recipe reading failed.');
    }
    if (new TextEncoder().encode(text).length !== file.size) {
        throw new ProPlanError('recipe_file_changed', 'Recipe file size changed while reading.');
    }
    return importPortableProRecipe(text, options);
}
export async function prepareRecipeDownload(plan) {
    const content = await exportPortableProRecipe(plan);
    const result = new Blob([content], { type: JSON_TYPE });
    if (result.size < 1 || result.size > MAX_PORTABLE_RECIPE_BYTES) {
        throw new ProPlanError('invalid_recipe_size', 'Recipe export exceeded the bounded size.');
    }
    return result;
}
export function saveLocalRecipe(blob, filename = PORTABLE_FILENAME, env = {
    createObjectURL: value => URL.createObjectURL(value),
    revokeObjectURL: value => URL.revokeObjectURL(value),
    createAnchor: () => document.createElement('a'),
}) {
    validateFilename(filename);
    if (!(blob instanceof Blob) || blob.type !== JSON_TYPE ||
        blob.size < 1 || blob.size > MAX_PORTABLE_RECIPE_BYTES) {
        throw new ProPlanError('invalid_recipe_blob', 'Settings-only recipe JSON is required.');
    }
    const url = env.createObjectURL(blob);
    if (typeof url !== 'string' || url.length < 1) {
        throw new ProPlanError('recipe_download_failed', 'Could not prepare local recipe download.');
    }
    try {
        const anchor = env.createAnchor();
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
    }
    finally {
        env.revokeObjectURL(url);
    }
}
//# sourceMappingURL=recipe-local-io.js.map