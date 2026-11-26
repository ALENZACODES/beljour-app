/** Accessible, opt-in local Proof controls for Save System embedding.
 *
 * All DOM output uses textContent, not innerHTML. The view shows only counts,
 * never pixels, filenames, face locations, user IDs or a quality score. A caller
 * mounts this on a Save panel it owns and supplies transient data only when the
 * user actually requests a check. No storage, network or paid provider is used.
 * Author: John Khan.
 */
import { createPortableProof, receiptDescription, summarizePortableProof } from "./proof-receipt.js";
import { ProofSession } from "./proof-session.js";
export const PROOF_WIDGET_FORMAT = "beljour-proof-widget/1";
function create(parent, tag, text) {
    const element = parent.ownerDocument.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
}
function accessibleLabel(input) {
    const candidate = input?.trim() || "Saved look local check";
    if (candidate.length > 80 || /[\u0000-\u001f<>]/u.test(candidate)) {
        throw new TypeError("invalid proof panel heading");
    }
    return candidate;
}
/**
 * A self-contained view that can be mounted by the Save panel without adding
 * a global entry point or weakening the application's network boundary.
 */
export function mountProofWidget(root, options) {
    if (!root || !root.ownerDocument || typeof root.appendChild !== "function" ||
        !options || typeof options.readSource !== "function") {
        throw new TypeError("proof view needs a DOM root and local input reader");
    }
    if (options.deliverReceipt !== undefined && typeof options.deliverReceipt !== "function") {
        throw new TypeError("invalid local receipt delivery");
    }
    const title = accessibleLabel(options.title);
    const session = options.session ?? new ProofSession();
    const section = create(root, "section", "");
    section.className = "lg-proof-widget";
    section.setAttribute("aria-label", title);
    section.setAttribute("role", "group");
    create(section, "h3", title);
    const description = create(section, "p", "Checks replay and photo-export mechanics on this device. Not a real-face or beauty score.");
    description.className = "lg-proof-description";
    const status = create(section, "p", "No local check has been run.");
    status.className = "lg-proof-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    const counts = create(section, "p", "");
    counts.className = "lg-proof-counts";
    const actions = create(section, "section", "");
    actions.className = "lg-proof-actions";
    const check = create(actions, "button", "Check saved look");
    const cancel = create(actions, "button", "Cancel check");
    const receipt = create(actions, "button", "Export count-only receipt");
    check.type = "button";
    cancel.type = "button";
    receipt.type = "button";
    receipt.setAttribute("aria-label", "Export local mechanical proof counts only");
    let destroyed = false;
    let requestNumber = 0;
    let activeRecipe = null;
    let exporting = false;
    let checked = false;
    let pendingSource = false;
    let exportNotice = "";
    const render = (state) => {
        if (destroyed)
            return;
        const checking = state.phase === "checking";
        section.setAttribute("aria-busy", String(checking));
        check.disabled = checking || pendingSource;
        cancel.disabled = !checking && !pendingSource && !exporting;
        receipt.disabled = !checked || checking || pendingSource || exporting || !options.deliverReceipt || state.audit === null;
        counts.textContent = "";
        if (pendingSource) {
            status.textContent = "Preparing local check on this device.";
        }
        else if (state.phase === "idle") {
            status.textContent = "No local check has been run.";
        }
        else if (checking) {
            status.textContent = "Checking saved look locally. Original photo stays in this browser.";
            if (state.progress) {
                const progress = state.progress;
                counts.textContent = `${progress.completed}/${progress.expected} images checked; ` +
                    `${progress.missing} not yet checked.`;
            }
        }
        else if (state.phase === "cancelled") {
            status.textContent = state.reason === "changed_photo"
                ? "Photo or recipe changed. Previous proof cleared."
                : "Check cancelled. No old result was accepted.";
        }
        else if (state.phase === "error") {
            status.textContent = "Local check could not start. Your original and saved recipe were kept.";
        }
        else if (state.audit) {
            status.textContent = exportNotice || "Local mechanical check complete.";
            counts.textContent = receiptDescription(summarizePortableProof(state.audit));
        }
    };
    const unsubscribe = session.subscribe(render);
    const handleCheck = async () => {
        if (destroyed || session.state().phase === "checking")
            return;
        const myRequest = ++requestNumber;
        checked = false;
        activeRecipe = null;
        exportNotice = "";
        pendingSource = true;
        session.changeSource();
        render(session.state());
        try {
            const input = await options.readSource();
            if (destroyed || myRequest !== requestNumber)
                return;
            pendingSource = false;
            render(session.state());
            if (!input) {
                status.textContent = "Open a photo and choose a saved look to run the check.";
                return;
            }
            activeRecipe = input.recipe;
            const result = await session.run(input.recipe, input.batch, input.engine);
            if (destroyed || myRequest !== requestNumber)
                return;
            checked = result.audit !== null;
            render(result);
        }
        catch {
            if (!destroyed && myRequest === requestNumber) {
                activeRecipe = null;
                checked = false;
                pendingSource = false;
                render(session.state());
                status.textContent = "Cannot check this saved look. Your photo remains unchanged.";
            }
        }
    };
    const handleCancel = () => {
        requestNumber++;
        activeRecipe = null;
        checked = false;
        pendingSource = false;
        exporting = false;
        exportNotice = "";
        session.cancel();
        render(session.state());
    };
    const handleExport = async () => {
        if (destroyed || exporting || !checked || !activeRecipe || !options.deliverReceipt)
            return;
        const state = session.state();
        if (!state.audit || state.phase === "checking")
            return;
        const myRequest = requestNumber;
        exporting = true;
        render(state);
        try {
            const text = await createPortableProof(state.audit, activeRecipe);
            if (destroyed || myRequest !== requestNumber)
                return;
            await options.deliverReceipt("LookProof-counts.json", text);
            if (!destroyed && myRequest === requestNumber) {
                exportNotice = "Count-only receipt exported. This is not a signed quality certificate.";
            }
        }
        catch {
            if (!destroyed && myRequest === requestNumber) {
                exportNotice = "Receipt export was unavailable. The saved look is unchanged.";
            }
        }
        finally {
            exporting = false;
            render(session.state());
        }
    };
    const clickCheck = () => { void handleCheck(); };
    const clickCancel = () => { handleCancel(); };
    const clickReceipt = () => { void handleExport(); };
    check.addEventListener("click", clickCheck);
    cancel.addEventListener("click", clickCancel);
    receipt.addEventListener("click", clickReceipt);
    render(session.state());
    return {
        invalidate() {
            if (destroyed)
                return;
            requestNumber++;
            activeRecipe = null;
            checked = false;
            pendingSource = false;
            exportNotice = "";
            session.changeSource();
            render(session.state());
        },
        destroy() {
            if (destroyed)
                return;
            requestNumber++;
            destroyed = true;
            activeRecipe = null;
            check.removeEventListener("click", clickCheck);
            cancel.removeEventListener("click", clickCancel);
            receipt.removeEventListener("click", clickReceipt);
            unsubscribe();
            session.dispose();
            section.remove();
        },
        state() {
            return session.state();
        },
    };
}
//# sourceMappingURL=proof-widget.js.map