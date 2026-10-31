/** App shell: header, step bar, pinned photo panel and hash routing. */
import { api, apiBase, store } from "./api.js";
import { STEPS, releaseLocalPhoto, routeReady } from "./ctx.js";
import { announce, clear, h } from "./dom.js";
import { mountClientShell } from "./layout/client-shell.js";
import { parseClassicRoute, RouteRevision } from "./layout/route-state.js";
import { renderBody } from "./screens/body.js";
import { renderHair } from "./screens/hair.js";
import { renderPhoto, beforeNextPhotoUpload } from "./screens/photo.js";
import { renderReel } from "./screens/reel.js";
import { renderVideoLive } from "./screens/video-live.js";
import { renderPreviews } from "./screens/previews.js";
import { renderProportions } from "./screens/proportions.js";
import { renderShade } from "./screens/shade.js";
import { renderPalettes } from "./screens/palettes.js";
import { renderSkin } from "./screens/skin.js";
import { renderTryon } from "./screens/tryon.js";
import { resumePending } from "./session.js";
import { clearAll, listSkin } from "./store.js";
import { appConsent } from "./ui/shell/consent.js";
const main = document.getElementById("main");
const steps = document.getElementById("steps");
const panel = document.getElementById("photo-panel");
const mode = document.getElementById("mode");
const ctx = {
    consent: appConsent.hasVisit,
    photo: null,
    photoSrc: null,
    face: null,
    size: null,
    shade: null,
    tryon: {},
    faceShape: null,
    body: null,
    go: (route) => { location.hash = `#/${route}`; },
    refreshPhotoPanel,
};
let clientShell = mountClientShell(document, window, {
    page: "classic",
    health: apiBase() === null ? undefined : () => api.health().then(() => true).catch(() => false),
    retryView: () => { void route(); },
});
let routeRevision = new RouteRevision();
function refreshPhotoPanel() {
    clientShell.update("classic", location.hash, {
        hasPhoto: Boolean(ctx.photoSrc),
        hasConsent: Boolean(ctx.consent && ctx.photo),
    });
    clear(panel);
    if (!ctx.photoSrc) {
        panel.append(h("div", { class: "plumb-empty", "aria-hidden": "true" }), h("p", { class: "fine" }, "Your photo will sit here while you work."));
        return;
    }
    const del = h("button", { class: "btn btn-quiet btn-small" }, ctx.photo?.sample ? "Stop using the sample" : "Delete my photo now");
    del.addEventListener("click", async () => {
        const photo = ctx.photo, bodyPhoto = ctx.body?.photo;
        if (photo)
            appConsent.revokePhoto(photo.photo_id);
        if (bodyPhoto && bodyPhoto.photo_id !== photo?.photo_id)
            appConsent.revokePhoto(bodyPhoto.photo_id);
        disposeScreen?.();
        disposeScreen = null;
        releaseLocalPhoto(ctx);
        ctx.photo = null;
        ctx.photoSrc = null;
        ctx.face = null;
        ctx.shade = null;
        ctx.localShade = null;
        ctx.size = null;
        ctx.body = null;
        ctx.faceShape = null;
        ctx.tryon = {};
        refreshPhotoPanel();
        if (location.hash === "#/photo")
            void route();
        else
            ctx.go("photo");
        try {
            const r = photo ? await beforeNextPhotoUpload(ctx, () => api.deletePhoto(photo.photo_id)) : { results_removed: 0 };
            announce(photo?.sample ? "Sample cleared." : `Photo deleted, along with ${r.results_removed} saved results.`);
        }
        catch { /* already gone */ }
        if (bodyPhoto && !bodyPhoto.sample && bodyPhoto.photo_id !== photo?.photo_id) {
            await api.deletePhoto(bodyPhoto.photo_id).catch(() => undefined);
        }
    });
    panel.append(h("figure", { class: "plumb-frame" }, h("img", { src: ctx.photoSrc, alt: "Your photo" }), h("span", { class: "plumb-line", "aria-hidden": "true" })), del);
}
function renderSteps(active) {
    clear(steps);
    steps.append(h("ol", {}, ...STEPS.map((s, i) => h("li", {}, h("a", { href: `#/${s.route}`, "aria-current": s.route === active ? "step" : undefined,
        class: routeReady(ctx, s.route) ? "" : "locked" }, h("span", { class: "step-n" }, String(i + 1)), s.label)))));
}
async function renderPrivacy() {
    clear(main);
    let count = 0;
    try {
        count = (await listSkin()).length;
    }
    catch { /* storage blocked */ }
    main.append(h("h1", {}, "Privacy"), h("ul", { class: "plain-list" }, h("li", {}, "No account, no tracking."), h("li", {}, "Opening a photo keeps it on this device. Preparing it on the app server is a separate choice and sends a re-encoded JPEG without the original file metadata. Approved YouCam makeup, hair styling and Skin AI product matching each ask for action-specific consent."), h("li", {}, "Uploaded photos are deleted from the app server within an hour. We ask YouCam to delete each task after its result returns."), h("li", {}, "Results are cached for up to a day so a repeat view is free. Deleting your photo removes them at once."), h("li", {}, "Current shade measurements, face ratios, symmetry and shape simulations run in your browser. Opening these local tools does not upload your photo or face points."), h("li", {}, `Saved history on this device: ${count} entr${count === 1 ? "y" : "ies"}. No photo files.`)), h("div", { class: "row" }, h("button", { class: "btn btn-quiet", onclick: async () => {
            const data = JSON.stringify(await listSkin(), null, 1);
            const a = h("a", { href: URL.createObjectURL(new Blob([data], { type: "application/json" })), download: "beljour-history.json" });
            a.click();
        } }, "Export my history"), h("button", { class: "btn btn-quiet", onclick: async () => { await clearAll(); announce("History cleared."); void renderPrivacy(); } }, "Clear my history")));
}
let disposeScreen = null;
async function route() {
    const revision = routeRevision.begin();
    disposeScreen?.();
    disposeScreen = null;
    const r = parseClassicRoute(location.hash);
    const target = routeReady(ctx, r) ? r : "photo";
    if (target !== r) {
        announce(ctx.photoSrc ? "This tool needs the photo prepared on the app server first." : "Open a photo first. Built-in samples work too.");
    }
    renderSteps(target);
    clientShell.update("classic", location.hash, {
        hasPhoto: Boolean(ctx.photoSrc),
        hasConsent: Boolean(ctx.consent && ctx.photo),
    });
    try {
        switch (target) {
            case "photo":
                disposeScreen = renderPhoto(main, ctx);
                break;
            case "skin":
                renderSkin(main, ctx);
                break;
            case "shade":
                renderShade(main, ctx);
                break;
            case "palettes":
                disposeScreen = renderPalettes(main, ctx);
                break;
            case "tryon":
                renderTryon(main, ctx);
                break;
            case "hair":
                renderHair(main, ctx);
                break;
            case "proportions":
                renderProportions(main, ctx);
                break;
            case "previews":
                await renderPreviews(main, ctx);
                break;
            case "body":
                await renderBody(main, ctx);
                break;
            case "reel":
                renderReel(main, ctx);
                break;
            case "video":
                disposeScreen = renderVideoLive(main, ctx);
                break;
            case "privacy":
                await renderPrivacy();
                break;
        }
        if (routeRevision.isLatest(revision))
            clientShell.errors?.dismiss();
    }
    catch {
        if (!routeRevision.isLatest(revision))
            return;
        // This boundary does not delete or re-upload the photo.
        clear(main);
        main.append(h("h1", {}, "This view could not open"), h("p", {}, "Your photo has not been cleared. You can retry or choose another tool."), h("button", { class: "btn", onclick: () => { void route(); } }, "Try this view again"), h("a", { href: "#/photo", class: "btn btn-quiet" }, "Open photo step"));
        clientShell.errors?.showViewError();
    }
    if (!routeRevision.isLatest(revision))
        return;
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", () => void route());
window.addEventListener("pagehide", () => {
    if (ctx.photo)
        appConsent.revokePhoto(ctx.photo.photo_id);
    routeRevision.stop();
    clientShell.destroy();
    disposeScreen?.();
    disposeScreen = null;
    releaseLocalPhoto(ctx);
    ctx.photoSrc = null;
    ctx.photo = null;
    ctx.face = null;
    ctx.size = null;
    ctx.localShade = null;
});
window.addEventListener("pageshow", event => {
    if (!event.persisted)
        return;
    clientShell = mountClientShell(document, window, {
        page: "classic",
        health: apiBase() === null ? undefined : () => api.health().then(() => true).catch(() => false),
        retryView: () => { void route(); },
    });
    routeRevision = new RouteRevision();
    refreshPhotoPanel();
    void route();
});
refreshPhotoPanel();
void route();
api.health().then((hl) => {
    clientShell.connection?.tracker.setService(true);
    mode.textContent = hl.live ? "Live: uses YouCam units" : "Demo mode: saved results, no units used";
    mode.className = hl.live ? "mode live" : "mode demo";
    // tasks that were still running when the page or the server last went away
    if (!appConsent.localOnly)
        void resumePending(store, api.resumeTasks).catch(() => undefined);
}).catch(() => {
    if (apiBase() === null) {
        mode.textContent = "On-device mode: cloud features are off";
        mode.className = "mode demo";
        return;
    }
    clientShell.connection?.tracker.setService(false);
    mode.textContent = "Server asleep or offline";
    mode.className = "mode off";
});
// R15 Workstream B additive navigation. Author: John Khan.
import { installEyesBrowsLink } from "./ui/eyes-brows/install.js";
installEyesBrowsLink(document.querySelector(".foot"));
