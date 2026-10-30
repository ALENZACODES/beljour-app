/** One browser path for makeup / hair styling: consent, quote, user click, background task, poll.
 * The API only sees an explicitly clicked request. Tickets are kept for resume; zero
 * storage means no duplicate charge after an interrupted connection.
 * R9: the consent gate is asked first, so without visit and photo consent the request
 * stops before the quote, with no network call at all.
 * Author: John Khan.
 */
import { api, store } from "../api.js";
import { appConsent, attestationFor } from "./shell/consent.js";
import { addPending, removePending, waitForTask } from "../session.js";
/** Task status does not guarantee there is an image; never treat 'done' alone as success. */
export function finishedImage(result) {
    if (result.status === "done" && result.image)
        return result.image;
    if (result.status === "done")
        throw new Error("The styling result has no image. Open the task again or try another look.");
    if (result.status === "running")
        throw new Error("Styling is still running. Your task is saved for recovery.");
    if (result.status === "ambiguous")
        throw new Error("This task may have been charged. Check its status; don't start it twice.");
    if (result.status === "expired")
        throw new Error("That result has expired. Make a new selection.");
    throw new Error(result.error || `Styling task is ${result.status}.`);
}
/** Injection point makes this a full offline state-machine test, without timers or network. */
export async function performStyling(transport, body, { onUpdate = (() => { }), sleep, tries = 60, everyMs = 2000, remember = (_started) => { }, forget = (_key) => { }, consent } = {}) {
    // Consent comes before anything else, including the quote.
    const grant = consent?.require(body.photo_id, body.action);
    onUpdate("Checking the live styling quote");
    const { consent: _ignored, ...quoted } = body;
    const price = await transport.quote(quoted);
    if (price.scope !== "youcam")
        throw new Error("This task is not an approved makeup or styling action.");
    if (!price.can_apply)
        throw new Error(price.unavailable_reason || "This styling action isn't available.");
    onUpdate(price.cached ? "Opening the saved result at no cost" : `Starting a ${price.units}-unit styling task`);
    const started = await transport.startTask(grant ? { ...body, consent: attestationFor(grant, body.photo_id, body.action) } : body);
    if (started.ticket)
        remember(started);
    if (started.status !== "running" && started.status !== "done")
        throw new Error("Unexpected task reply");
    onUpdate(started.status === "done" ? "Opening the result" : "Waiting for YouCam's result");
    const outcome = await waitForTask(() => transport.task(started.request_key), { tries, everyMs, sleep });
    if (outcome.status !== "running")
        forget(started.request_key);
    finishedImage(outcome);
    onUpdate("Styling ready");
    return outcome;
}
/** Product UI wiring; only called in response to a deliberate Apply click, and only for a photo
 * the person has cleared in the consent gate. */
export function applyStyling(body, onUpdate) {
    return performStyling(api, body, { onUpdate, consent: appConsent,
        remember: (t) => { if (t.ticket)
            addPending(store, t.ticket); },
        forget: (key) => { removePending(store, key); },
    });
}
//# sourceMappingURL=styling-tasks.js.map