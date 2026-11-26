import { browserRecovery, recoveryDraft } from "../save/recovery.js";
import { recipeAvailability } from "../save/capabilities.js";
import { LocalDiagnostics } from "../diagnostics/errors.js";
export function editorDraft(editor) {
    const layers = editor.document.layers;
    if (!layers.length)
        return null;
    return recoveryDraft(layers.map((layer) => ({ tool: layer.kind, strength: layer.strength,
        provider: layer.provenance, settings: { ...layer.parameters } })), layers.map((layer) => ({ enabled: layer.enabled, opacity: layer.opacity })));
}
export function restoreDraft(editor, draft) {
    if (editor.document.layers.length)
        return { applied: 0, reasons: ["Reset the current edits before restoring another look."] };
    // Validate again at the integration boundary, even for an in-memory caller.
    const clean = recoveryDraft(draft.recipe.versions[0].steps, draft.layers);
    const steps = clean.recipe.versions[0].steps;
    const reasons = recipeAvailability(steps, editor.source).filter((row) => !row.available).map((row) => `${row.tool}: ${row.reason}`);
    if (reasons.length)
        return { applied: 0, reasons };
    let added = 0;
    try {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i], layer = editor.add(step.tool, step.settings, step.strength);
            editor.update(layer.id, clean.layers[i], "Restore layer settings");
            added++;
        }
        return { applied: added, reasons: [] };
    }
    catch {
        editor.resetLayers();
        return { applied: 0, reasons: ["These settings could not be restored. Your original photo is unchanged."] };
    }
}
export function mountSessionTools(editor, redraw, recovery = browserRecovery(), doc = document) {
    const host = doc.querySelector(".shell-nav-footer");
    if (!host)
        return () => undefined;
    const panel = doc.createElement("details"), summary = doc.createElement("summary");
    panel.className = "shell-session-tools";
    summary.textContent = "Recovery and device checks";
    const note = doc.createElement("p");
    note.className = "shell-small";
    note.setAttribute("role", "status");
    const explanation = doc.createElement("p");
    explanation.className = "shell-small";
    explanation.textContent = "This tab keeps only your edit settings for up to 12 hours. Choose your photo again to restore them. Photos and face points are never saved here.";
    const button = (label, action) => {
        const node = doc.createElement("button");
        node.type = "button";
        node.className = "shell-button";
        node.textContent = label;
        node.addEventListener("click", action);
        return node;
    };
    const read = recovery.read();
    let pending = read.status === "ready" ? read.draft : null;
    let sourceId = editor.source.id, lastCount = editor.document.layers.length, restoring = false;
    const diagnostics = new LocalDiagnostics();
    const status = () => {
        restore.disabled = !pending || editor.source.kind !== "uploaded" || editor.document.layers.length > 0;
        discard.disabled = !pending;
    };
    const restore = button("Restore settings on this photo", () => {
        if (!pending)
            return;
        restoring = true;
        try {
            const result = restoreDraft(editor, pending);
            note.textContent = result.applied ? `Restored ${result.applied} edits. Check each one on this photo.` : result.reasons.join(" ");
            if (result.applied)
                pending = null;
        }
        catch {
            note.textContent = "The saved settings are damaged. Your photo is unchanged.";
        }
        finally {
            restoring = false;
            sourceId = editor.source.id;
            lastCount = editor.document.layers.length;
            status();
            redraw();
        }
    });
    const discard = button("Discard recovered settings", () => {
        const cleared = recovery.clear();
        pending = null;
        status();
        note.textContent = cleared ? "Recovered settings removed." : "Storage is unavailable. Nothing was restored.";
    });
    note.textContent = pending ? `${pending.layers.length} edits are ready to recover after you open a photo.` :
        read.status === "unavailable" ? "Storage is unavailable; editing still works." :
            read.status === "expired" || read.status === "invalid" ? "Old or damaged recovery data was removed." : "Recovery will keep your next edit settings in this tab.";
    const codes = doc.createElement("pre");
    codes.className = "shell-small";
    codes.hidden = true;
    const show = button("Show local diagnostic codes", () => { codes.hidden = !codes.hidden; codes.textContent = diagnostics.exportText(); });
    const clear = button("Clear diagnostic codes", () => { diagnostics.clear(); });
    const refreshCodes = diagnostics.subscribe(() => { if (!codes.hidden)
        codes.textContent = diagnostics.exportText(); });
    const unlisten = doc.defaultView ? diagnostics.listen(doc.defaultView) : () => undefined;
    const unsubscribe = editor.subscribe(() => {
        if (restoring)
            return;
        if (editor.source.id !== sourceId) {
            sourceId = editor.source.id;
            lastCount = 0;
            const saved = recovery.read();
            pending = saved.status === "ready" ? saved.draft : null;
            if (pending)
                note.textContent = `${pending.layers.length} previous edits can be restored on this photo. Check them before saving.`;
            status();
            return;
        }
        const count = editor.document.layers.length;
        if (!count) {
            if (lastCount) {
                recovery.clear();
                pending = null;
                note.textContent = "Edits reset; recovery cleared.";
            }
        }
        else {
            try {
                const draft = editorDraft(editor);
                const result = draft ? recovery.save(draft) : "invalid";
                if (result === "saved") {
                    pending = null;
                    note.textContent = "Edit settings recovered in this tab. No photo was saved.";
                }
                if (result === "unavailable") {
                    diagnostics.record("storage_denied", "storage");
                    note.textContent = "Storage is unavailable; save your look before leaving.";
                }
                if (result === "invalid")
                    note.textContent = "These edits cannot be recovered automatically. Save a photo before leaving.";
            }
            catch {
                note.textContent = "These edits cannot be recovered automatically. Editing still works.";
            }
        }
        lastCount = count;
        status();
    });
    panel.append(summary, explanation, note, restore, discard, show, clear, codes);
    host.append(panel);
    status();
    let disposed = false;
    return () => { if (disposed)
        return; disposed = true; unsubscribe(); unlisten(); refreshCodes(); diagnostics.clear(); panel.remove(); };
}
//# sourceMappingURL=session-tools.js.map