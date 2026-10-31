/** Layout v1 Trust Centre screen: one screen she can screenshot, one tap from every screen.
 * Switches are wired to the real consent gate and the export label setting; deletion runs the
 * real steps in trust.ts and shows the receipt. No network call is made unless a photo id is
 * known for this tab, and then only our own server's DELETE route.
 * Author: John Khan.
 */
import { clear, h } from "../dom.js";
import { api } from "../api.js";
import { appConsent, STORAGE_KEY } from "../ui/shell/consent.js";
import { browserStore, PENDING_KEY, SESSION_KEY } from "../session.js";
import { clearAll } from "../store.js";
import { CheckinStore } from "../engines/skin-checkin/store.js";
import { RECOVERY_KEY } from "../save/recovery.js";
import { browserLookStorage } from "../save/storage.js";
import { LookStore, browserLooks } from "./my-looks.js";
import { myPhotos } from "../photos/library.js";
import { clearDeviceHistory, PHOTO_IDS_KEY, deleteFaceData, knownPhotoIds, receiptText, setToggle, simulationLabelPref, trustItems } from "./trust.js";
export function mountTrust(doc = document) {
    const session = browserStore();
    const deps = { consent: appConsent, simulationLabel: simulationLabelPref(session) };
    const list = doc.getElementById("lg-trust-list");
    const out = doc.getElementById("lg-receipt");
    if (!list || !out)
        return;
    const render = () => {
        clear(list);
        for (const item of trustItems(deps)) {
            if (item.id === "delete")
                continue;
            const control = item.toggle
                ? h("label", { class: "lg-switch" }, h("input", { type: "checkbox", checked: item.state === "on", onchange: (e) => {
                        setToggle(deps, item.id, e.target.checked);
                        render();
                    } }), h("span", {}, item.state === "on" ? "On" : "Off"))
                : h("span", { class: `lg-state lg-state-${item.state.replace(" ", "-")}` }, item.state === "not built" ? "Not built" : "In place");
            list.append(h("li", { class: "lg-trust-item" }, h("div", {}, h("strong", {}, item.title), h("p", { class: "lg-small" }, item.detail)), control));
        }
    };
    render();
    mountMyPhotos(doc);
    const also = doc.getElementById("lg-delete-looks");
    doc.getElementById("lg-delete")?.addEventListener("click", async () => {
        const del = {
            // the on-device switch is a privacy setting, not face data, so deleting never turns it off
            consent: appConsent, session, sessionKeys: [STORAGE_KEY, SESSION_KEY, PENDING_KEY, PHOTO_IDS_KEY, RECOVERY_KEY],
            clearHistory: () => clearDeviceHistory(clearAll, new CheckinStore()), photoIds: knownPhotoIds(session), deletePhoto: (id) => api.deletePhoto(id),
            looks: new LookStore(browserLooks()), versionedLooks: browserLookStorage(),
            alsoLooks: Boolean(also?.checked), clock: () => new Date(), myPhotos: myPhotos(),
        };
        const receipt = await deleteFaceData(del);
        clear(out);
        out.append(h("h2", {}, `Receipt ${receipt.id}`), h("p", { class: "lg-small" }, new Date(receipt.at).toLocaleString()), h("ul", { class: "lg-plain" }, ...receipt.lines.map((l) => h("li", {}, h("strong", {}, `${l.what}: ${l.result}. `), l.detail))), h("a", { class: "lg-link", download: `deletion-${receipt.id}.txt`,
            href: "data:text/plain;charset=utf-8," + encodeURIComponent(receiptText(receipt)) }, "Save the receipt"));
        out.hidden = false;
        render();
    });
}
/** My photos on this device: how many are kept, the keep switch and Delete all. */
function mountMyPhotos(doc) {
    const library = myPhotos();
    const count = doc.getElementById("lg-photos-count");
    const keep = doc.getElementById("lg-photos-keep");
    const remove = doc.getElementById("lg-photos-delete");
    if (!count || !keep || !remove)
        return;
    let note = "";
    const show = async () => {
        const n = (await library.list()).length;
        keep.checked = library.keep.get() !== "off";
        keep.disabled = !library.usable;
        remove.disabled = !library.usable || !n;
        count.textContent = !library.usable ? "This browser isn't letting Beljour keep photos (a private window, or storage is off), so none are kept. Picking a photo still works."
            : `${n} photo${n === 1 ? "" : "s"} kept on this device.${keep.checked ? "" : " Keeping is off."}${note ? ` ${note}` : ""}`;
    };
    keep.addEventListener("change", async () => {
        const removed = await library.setKeeping(keep.checked);
        note = keep.checked ? "The next photo you pick is kept." : removed ? `${removed} kept photo${removed === 1 ? " was" : "s were"} deleted.` : "";
        await show();
    });
    remove.addEventListener("click", async () => {
        const removed = await library.clear();
        note = `${removed} photo${removed === 1 ? "" : "s"} deleted from this device.`;
        await show();
    });
    library.subscribe(() => { void show(); });
    void show();
}
