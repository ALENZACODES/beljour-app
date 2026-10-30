/** Classic Hair Studio route. R10 reuses HairStudio, the R9 consent gate and the R8
 * background task/price/resume flow. No direct provider fetches or second app shell.
 * A reference is uploaded only AFTER explicit Apply, prior original-photo consent and
 * a separate reference-rights checkbox. Reference photo is deleted at end of task.
 * Author: John Khan.
 */
import { api, store } from "../api.js";
import { requirePhoto } from "../ctx.js";
import { clear, h } from "../dom.js";
import { rememberPhotoId } from "../layout/trust.js";
import { HairStudio } from "../ui/studios/hair/view.js";
import { liveHairResult } from "../ui/studios/hair/replay.js";
import { appConsent } from "../ui/shell/consent.js";
import { sendConsentBox } from "../ui/send-consent.js";
import { applyStyling } from "../ui/styling-tasks.js";
export function renderHair(main, ctx) {
    if (!requirePhoto(ctx) || !ctx.photo)
        return;
    clear(main);
    const status = h("p", { class: "hint", role: "status", "aria-live": "polite" }, "Offline sample ready. No units are spent until you request a quoted styling result.");
    const photo = ctx.photo;
    const context = {
        mode: "classic",
        photoId: photo.photo_id,
        originalSrc: ctx.photoSrc,
        image: ctx.size ? { width: ctx.size.w, height: ctx.size.h,
            landmarks: ctx.face?.points ?? null, synthetic: photo.sample } : null,
    };
    async function apply(request) {
        // This is checked before reference upload, the quote, and task creation.
        appConsent.require(photo.photo_id, request.action);
        if (photo.sample)
            throw new Error("Use a real, consented photo rather than the illustration for a live task.");
        const payload = { photo_id: photo.photo_id, action: request.action, options: request.options };
        let ephemeralReference = null;
        try {
            if (request.action === "hair-transfer") {
                if (!request.referenceFile || request.referenceRights !== true)
                    throw new Error("Choose a permitted reference haircut and confirm your rights first.");
                // The file picker never uploads or requests a quote by itself.
                const image = await api.uploadPhoto(request.referenceFile);
                if (image.photo_id === photo.photo_id)
                    throw new Error("The reference photo must be different from the portrait.");
                ephemeralReference = image.photo_id;
                rememberPhotoId(store, ephemeralReference);
                payload.reference_photo_id = ephemeralReference;
                payload.reference_rights = true;
            }
            const outcome = await applyStyling(payload, (message) => { status.textContent = message; });
            status.textContent = "Styling finished. Check the result on your own photo.";
            return liveHairResult(outcome, request.action === "hair-transfer" ? "Reference haircut preview" : "Hair adjunct preview");
        }
        finally {
            if (ephemeralReference) {
                try {
                    await api.deletePhoto(ephemeralReference);
                }
                catch {
                    status.textContent = "Reference photo cleanup could not be confirmed. Use your photo delete control.";
                }
            }
        }
    }
    const studio = new HairStudio({ ...context, onApply: apply });
    const consent = sendConsentBox(() => [photo.photo_id], "hair", () => studio.setContext({ ...context, onApply: apply }), appConsent, "Send this particular portrait to YouCam for hair styling");
    const link = h("a", { href: "studio.html", class: "btn btn-quiet" }, "Open the original R9 studio shell");
    const head = h("div", { class: "hair-classic-head" }, h("h1", {}, "Hair Studio"), h("p", { class: "lede" }, "Explore cuts with one synthetic sample. Reference transfers require a real photo, permission and a separate provider quote."), link);
    main.append(head, consent, status, studio.element);
}
//# sourceMappingURL=hair.js.map