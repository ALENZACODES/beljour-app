export const DISCLOSURE = 'User-exported local packet. Page 1 is unedited; page 2 is a labelled simulation.';
function checkedImage(data, mime) {
    if (!(data instanceof Uint8Array) || data.length < 16 || data.length > 4_000_000) {
        throw new Error('Local image bytes exceed permitted bounds');
    }
    if (mime === 'image/png') {
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (signature.some((value, index) => data[index] !== value))
            throw new Error('Invalid PNG signature');
    }
    else if (mime === 'image/jpeg') {
        if (data[0] !== 255 || data[1] !== 216 || data[2] !== 255 ||
            data[data.length - 2] !== 255 || data[data.length - 1] !== 217) {
            throw new Error('Invalid JPEG signature');
        }
    }
    else {
        throw new Error('Unsupported image MIME');
    }
}
function checkedSteps(steps) {
    if (!Array.isArray(steps) || steps.length > 12)
        throw new Error('At most 12 notes');
    for (const step of steps) {
        if (typeof step !== 'string' || step.length < 1 || step.length > 160 ||
            [...step].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126)) {
            throw new Error('Notes must be 1..160 plain ASCII characters');
        }
    }
}
function base64(data) {
    const chunk = 8192;
    let output = '';
    for (let index = 0; index < data.length; index += chunk) {
        output += String.fromCharCode(...data.subarray(index, index + chunk));
    }
    return btoa(output);
}
async function digest(data) {
    const buffer = Uint8Array.from(data);
    const result = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, '0')).join('');
}
async function page(index, label, data, mime) {
    return { number: index, label, mime,
        data_url: `data:${mime};base64,${base64(data)}`, sha256: await digest(data) };
}
function time(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
        throw new Error('UTC timestamp required');
    }
    const result = Date.parse(value);
    if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 19) !== value.slice(0, 19)) {
        throw new Error('Invalid timestamp');
    }
    return result;
}
export async function exportSalonPack(original, preview, options) {
    if (options.userInitiated !== true)
        throw new Error('Explicit user export required');
    checkedImage(original, options.originalMime);
    checkedImage(preview, options.previewMime);
    checkedSteps(options.steps);
    const expiresHours = options.expiresHours ?? 24;
    if (!Number.isInteger(expiresHours) || expiresHours < 1 || expiresHours > 168) {
        throw new Error('Expiry must be 1..168 hours');
    }
    const issued = time(options.createdAt);
    const expires = new Date(issued + expiresHours * 3600000).toISOString().replace('.000Z', 'Z');
    const pages = await Promise.all([
        page(1, 'Unedited original - reality reference', original, options.originalMime),
        page(2, 'Screen simulation - not physical result', preview, options.previewMime),
    ]);
    return { format: 'beljour-local-salon-pack/1', pages: [pages[0], pages[1]],
        steps: [...options.steps], created_at: options.createdAt, expires_at: expires,
        still_her_score: 100, provider_calls: 0, disclosure: DISCLOSURE };
}
export async function verifySalonPack(pack, now) {
    try {
        if (pack.format !== 'beljour-local-salon-pack/1' || pack.provider_calls !== 0 ||
            pack.still_her_score !== 100 || pack.disclosure !== DISCLOSURE || pack.pages.length !== 2) {
            return false;
        }
        if (pack.pages[0].number !== 1 || pack.pages[1].number !== 2 ||
            !pack.pages[0].label.startsWith('Unedited original') ||
            !pack.pages[1].label.startsWith('Screen simulation'))
            return false;
        const issued = time(pack.created_at), expiry = time(pack.expires_at), current = time(now);
        if (current < issued || current >= expiry || expiry - issued > 7 * 86400000)
            return false;
        checkedSteps(pack.steps);
        for (const page of pack.pages) {
            const prefix = `data:${page.mime};base64,`;
            if (!page.data_url.startsWith(prefix))
                return false;
            const decoded = atob(page.data_url.slice(prefix.length));
            const data = Uint8Array.from(decoded, c => c.charCodeAt(0));
            checkedImage(data, page.mime);
            if (await digest(data) !== page.sha256)
                return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=salonPack.js.map