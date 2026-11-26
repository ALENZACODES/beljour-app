/** Offline recipe I/O tests with a captured download endpoint.
 * No browser storage, server or biometric input is used.
 * Author: John Khan.
 */
import { levelFromTenths } from './levels.js';
import { createProPlan } from './plan.js';
import { ProPlanError } from './plan.js';
import { PORTABLE_FILENAME, prepareRecipeDownload, readLocalRecipe, saveLocalRecipe, } from './recipe-local-io.js';
function check(value, reason) {
    if (!value)
        throw new Error(`recipe io: ${reason}`);
}
async function rejects(code, callback) {
    try {
        await callback();
    }
    catch (error) {
        if (error instanceof ProPlanError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`recipe io: expected ${code}`);
}
function rejectsSync(code, callback) {
    try {
        callback();
    }
    catch (error) {
        if (error instanceof ProPlanError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`recipe io: expected ${code}`);
}
function samplePlan() {
    return createProPlan([
        { index: 0, name: 'identitylock', level: levelFromTenths(10), scale: 2 },
        { index: 1, name: 'cleanup', level: levelFromTenths(30), scale: 2 },
        { index: 2, name: 'upscale', level: levelFromTenths(34), scale: 2 },
    ]);
}
class CapturedDownload {
    allocated = 0;
    revoked = 0;
    clicked = 0;
    lastFilename = null;
    lastHref = null;
    throwOnClick = false;
    make() {
        const owner = this;
        return {
            createObjectURL: (_blob) => {
                owner.allocated++;
                return `blob:local-${owner.allocated}`;
            },
            revokeObjectURL: (url) => {
                check(url.startsWith('blob:local-'), 'only owned URLs can be revoked');
                owner.revoked++;
            },
            createAnchor: () => ({
                href: '',
                download: '',
                click() {
                    owner.clicked++;
                    owner.lastFilename = this.download;
                    owner.lastHref = this.href;
                    if (owner.throwOnClick)
                        throw new Error('synthetic click failure');
                },
            }),
        };
    }
}
function localReader(blob) {
    return {
        size: blob.size,
        type: blob.type,
        text: async () => blob.text(),
    };
}
export async function testRecipeLocalIoR6H() {
    let count = 0;
    const payload = await prepareRecipeDownload(samplePlan());
    check(payload.type === 'application/json', 'JSON content type');
    check(payload.size > 0 && payload.size < 8192, 'bounded payload');
    count += 2;
    const restored = await readLocalRecipe(localReader(payload));
    check(restored.plan.steps.length === 3, 'recipe file imported');
    check(restored.plan.identity.enabled, 'identity remains on');
    count += 2;
    const download = new CapturedDownload();
    saveLocalRecipe(payload, undefined, download.make());
    check(download.clicked === 1, 'user-initiated click');
    check(download.allocated === 1 && download.revoked === 1, 'object URL cleaned');
    check(download.lastFilename === PORTABLE_FILENAME, 'safe default filename');
    check(download.lastHref === 'blob:local-1', 'owned blob URL');
    count += 4;
    saveLocalRecipe(payload, 'local-recipe-v2.json', download.make());
    check(download.lastFilename === 'local-recipe-v2.json', 'safe override allowed');
    count++;
    for (const name of ['../portrait.json', '..hidden.json', '', '.json', 'a.png',
        'a/other.json', 'a\\other.json', 'a'.repeat(90) + '.json']) {
        rejectsSync('invalid_recipe_filename', () => saveLocalRecipe(payload, name, download.make()));
        count++;
    }
    check(download.allocated === 2, 'bad filename never allocates URL');
    count++;
    const beforeFailure = download.revoked;
    download.throwOnClick = true;
    try {
        saveLocalRecipe(payload, undefined, download.make());
        throw new Error('missing click failure');
    }
    catch (error) {
        check(error instanceof Error && error.message === 'synthetic click failure', 'click failure surfaced');
    }
    check(download.revoked === beforeFailure + 1, 'URL revoked on failed click');
    count += 2;
    for (const file of [
        { size: 0, type: 'application/json', text: async () => '' },
        { size: 9000, type: 'application/json', text: async () => '{}' },
        { size: 5, type: 'image/jpeg', text: async () => '{}' },
        { size: 10, type: 'application/json', text: async () => '{}' },
    ]) {
        await rejects(file.size === 10 ? 'recipe_file_changed' : 'invalid_recipe_file', () => readLocalRecipe(file));
        count++;
    }
    await rejects('recipe_read_failed', () => readLocalRecipe({
        size: 5, type: 'application/json',
        text: async () => { throw new Error('read failed'); },
    }));
    count++;
    await rejects('identity_reconfirmation_required', async () => {
        const unlocked = createProPlan(samplePlan().steps, {
            enabled: false, mode: 'soften', strength: 'normal', explicit_user_override: true,
        });
        const exported = await prepareRecipeDownload(unlocked);
        return readLocalRecipe(localReader(exported));
    });
    count++;
    const unsigned = new Blob(['{}'], { type: 'text/plain' });
    await rejects('invalid_recipe_schema', () => readLocalRecipe(localReader(unsigned)));
    count++;
    rejectsSync('invalid_recipe_blob', () => saveLocalRecipe(new Blob(['no'], { type: 'text/plain' }), undefined, download.make()));
    count++;
    return count;
}
//# sourceMappingURL=test-recipe-local-io-r6h.js.map