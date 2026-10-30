/** Trust Centre model (feature 103, women-first rule 10, layout spec §3).
 * One screen she can screenshot. Each line is either wired to a real function in this app or
 * says "Not built" (spec §5.4: never a promise for something that doesn't exist).
 * Deletion is real: it withdraws consent, clears this tab's session and pending tasks, wipes the
 * on-device skin and body history, asks our server to delete any uploaded photo this tab knows
 * about, and returns a receipt listing each step. My Looks hold no face data and are kept
 * unless she ticks "also delete my saved looks".
 * Author: John Khan.
 */
import { fingerprint } from "./my-looks.js";
/** Skin and body history (IndexedDB) and the Skin Moment check-ins (skin-checkin store) in one
 * deletion step: both run even if one fails, and a failure is reported, never hidden. */
export async function clearDeviceHistory(clearStores, checkins) {
    let failure = null;
    try {
        await clearStores();
    }
    catch (error) {
        failure = error;
    }
    const out = checkins.deleteAll();
    if (!out.stored)
        throw new Error(out.note);
    if (failure)
        throw failure;
}
/** Uploaded photo ids of this tab, so deletion can ask the server to remove them. */
export const PHOTO_IDS_KEY = "beljour.photo-ids";
const PHOTO_ID = /^[A-Za-z0-9_-]{4,80}$/;
export function knownPhotoIds(store) {
    try {
        const raw = store?.getItem(PHOTO_IDS_KEY);
        const ids = raw ? JSON.parse(raw) : [];
        return Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && PHOTO_ID.test(x)) : [];
    }
    catch {
        return [];
    }
}
/** Called after an upload, never for the shared sample. Keeps the last 20 ids, tab only. */
export function rememberPhotoId(store, id) {
    if (!PHOTO_ID.test(id))
        return;
    const ids = [...knownPhotoIds(store).filter((x) => x !== id), id].slice(-20);
    try {
        store?.setItem(PHOTO_IDS_KEY, JSON.stringify(ids));
    }
    catch { /* deletion then relies on the server's one-hour limit */ }
}
export const SIM_LABEL_KEY = "beljour.sim-label";
/** The export label preference: on unless she turned it off (decisions Q17), tab only. */
export function simulationLabelPref(store) {
    return {
        get: () => { try {
            return store?.getItem(SIM_LABEL_KEY) !== "0";
        }
        catch {
            return true;
        } },
        set: (on) => {
            try {
                if (on)
                    store?.removeItem(SIM_LABEL_KEY);
                else
                    store?.setItem(SIM_LABEL_KEY, "0");
            }
            catch { /* page only */ }
        },
    };
}
export function trustItems(deps) {
    return [
        { id: "on-device", title: "On-device mode", toggle: true, state: deps.consent.localOnly ? "on" : "off",
            detail: "When on, nothing is ever sent to YouCam. Local tools keep working; makeup, hair styling and Skin Moment's skin analysis pause." },
        { id: "never-train", title: "We never train on your photos", toggle: false, state: "built",
            detail: "This app has no training step. Local edits never leave this device. A photo goes to YouCam only after you agree to it, for makeup or hair styling or a Skin Moment skin analysis, and our server deletes it within an hour." },
        { id: "neutral-defaults", title: "Neutral defaults", toggle: false, state: "built",
            detail: "No default ever lightens skin, slims a face or removes freckles or moles. Reshaping is off until you turn it on. Every default is checked on six skin tones before release." },
        { id: "simulation-label", title: "Simulation label on saved photos", toggle: true, state: deps.simulationLabel.get() ? "on" : "off",
            detail: "Edited photos say they are a simulation. On by default; you can turn it off for a photo." },
        { id: "swap-mark", title: "Visible mark on any swap", toggle: false, state: "not built",
            detail: "Not built: this app has no face swap. If one is ever added, its results carry a visible mark." },
        { id: "no-sexualised", title: "No sexualised styles", toggle: false, state: "not built",
            detail: "Not built: there are no avatar styles yet. When they come, they are tested by women on women before release." },
        { id: "delete", title: "Delete my face data", toggle: false, state: "built",
            detail: "Removes consent, this tab's session, skin and body history, Skin Moment check-ins and My photos on this device, and asks our server to delete your uploaded photo. You get a receipt." },
    ];
}
export function setToggle(deps, id, on) {
    if (id === "on-device")
        deps.consent.setLocalOnly(on);
    else if (id === "simulation-label")
        deps.simulationLabel.set(on);
    else
        throw new RangeError(`${id} has no switch`);
}
/** Run every deletion step; a failing step is recorded and the others still run. */
export async function deleteFaceData(deps) {
    const lines = [];
    const had = deps.consent.hasVisit;
    deps.consent.withdraw();
    lines.push({ what: "Consent", result: had ? "deleted" : "nothing to delete", detail: "Visit consent and every photo consent withdrawn." });
    let removed = 0;
    for (const key of deps.sessionKeys) {
        try {
            if (deps.session?.getItem(key) !== null && deps.session?.getItem(key) !== undefined) {
                deps.session.removeItem(key);
                removed++;
            }
        }
        catch { /* storage blocked: nothing kept there */ }
    }
    lines.push({ what: "This tab's session", result: removed ? "deleted" : "nothing to delete",
        detail: `${removed} stored item${removed === 1 ? "" : "s"} removed (session id, pending tasks, consent record).` });
    try {
        await deps.clearHistory();
        lines.push({ what: "Skin and body history on this device", result: "deleted", detail: "Dates and measurements only, including Skin Moment check-ins; no photos were stored." });
    }
    catch (error) {
        lines.push({ what: "Skin and body history on this device", result: "failed", detail: error instanceof Error ? error.message : "Storage refused" });
    }
    if (deps.myPhotos) {
        try {
            const n = await deps.myPhotos.clear();
            lines.push({ what: "My photos on this device", result: n ? "deleted" : "nothing to delete", detail: `${n} kept photo${n === 1 ? "" : "s"} removed from this browser.` });
        }
        catch {
            lines.push({ what: "My photos on this device", result: "failed", detail: "Browser storage refused deletion. Try Delete all my photos again." });
        }
    }
    if (!deps.photoIds.length) {
        lines.push({ what: "Uploaded photos on our server", result: "nothing to delete",
            detail: "This tab sent no photo. Any earlier upload is deleted by the server within an hour." });
    }
    else if (!deps.deletePhoto) {
        lines.push({ what: "Uploaded photos on our server", result: "failed", detail: "No connection; the server still deletes uploads within an hour." });
    }
    else {
        for (const id of deps.photoIds) {
            try {
                const res = await deps.deletePhoto(id);
                lines.push({ what: "Uploaded photo", result: res.deleted ? "deleted" : "nothing to delete", detail: `Photo ${id.slice(0, 6)}…` });
            }
            catch {
                lines.push({ what: "Uploaded photo", result: "failed", detail: `Photo ${id.slice(0, 6)}…: the server didn't answer; it deletes uploads within an hour.` });
            }
        }
    }
    if (deps.alsoLooks) {
        if (deps.looks) {
            try {
                const n = deps.looks.clear();
                lines.push({ what: "My Looks", result: n ? "deleted" : "nothing to delete", detail: `${n} saved look${n === 1 ? "" : "s"} (settings only).` });
            }
            catch {
                lines.push({ what: "My Looks", result: "failed", detail: "Browser storage refused deletion. Try again in this browser." });
            }
        }
        if (deps.versionedLooks) {
            try {
                const n = await deps.versionedLooks.clear();
                lines.push({ what: "Saved look versions", result: n ? "deleted" : "nothing to delete", detail: `${n} versioned recipe${n === 1 ? "" : "s"} removed.` });
            }
            catch {
                lines.push({ what: "Saved look versions", result: "failed", detail: "Browser storage refused deletion. Versioned recipes may remain." });
            }
        }
    }
    else {
        lines.push({ what: "My Looks", result: "kept", detail: "Settings only, no face data. Tick the box to delete them too." });
    }
    const at = deps.clock().toISOString();
    return { id: "R-" + fingerprint(at + JSON.stringify(lines)).toUpperCase(), at, lines };
}
export function receiptText(receipt) {
    return [`Deletion receipt ${receipt.id}`, receipt.at, ...receipt.lines.map((l) => `${l.what}: ${l.result}. ${l.detail}`)].join("\n");
}
//# sourceMappingURL=trust.js.map