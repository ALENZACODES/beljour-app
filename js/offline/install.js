export class OfflineInstaller {
    host;
    state;
    registration = null;
    pending = null;
    constructor(host) {
        this.host = host;
        this.state = host ? "available" : "unsupported";
    }
    enable() {
        if (!this.host)
            return Promise.resolve("unsupported");
        if (this.pending)
            return this.pending;
        this.state = "installing";
        this.pending = this.host.register("service-worker.js", { scope: "./", updateViaCache: "none" })
            .then((registration) => {
            this.registration = registration;
            this.state = registration.waiting ? "update_waiting" : registration.active ? "ready" : "installing";
            return this.state;
        }).catch(() => { this.state = "failed"; return this.state; })
            .finally(() => { this.pending = null; });
        return this.pending;
    }
    refresh() {
        if (this.registration?.waiting)
            this.state = "update_waiting";
        else if (this.registration?.active)
            this.state = "ready";
        return this.state;
    }
    applyUpdate(hasEdits) {
        if (hasEdits)
            return "save_first";
        if (!this.registration?.waiting)
            return "no_update";
        this.registration.waiting.postMessage({ type: "BELJOUR_ACTIVATE_AFTER_SAVE" });
        return "applied";
    }
}
export function mountOfflineTools(hasEdits, doc = document) {
    const host = doc.querySelector(".shell-nav-footer");
    if (!host)
        return () => undefined;
    let serviceWorker = null;
    try {
        serviceWorker = doc.defaultView?.navigator.serviceWorker ?? null;
    }
    catch { /* browser policy can block the getter */ }
    const installer = new OfflineInstaller(serviceWorker);
    const panel = doc.createElement("details"), summary = doc.createElement("summary"), note = doc.createElement("p");
    panel.className = "shell-session-tools";
    summary.textContent = "Offline tools";
    note.className = "shell-small";
    note.setAttribute("role", "status");
    note.textContent = serviceWorker ? "Keep the public editor on this device. Photos, face points, models and YouCam results are excluded. Device installation is available from your browser menu." : "Offline installation is unavailable in this browser. Editing still works while this page is open.";
    const install = doc.createElement("button"), update = doc.createElement("button");
    for (const button of [install, update]) {
        button.type = "button";
        button.className = "shell-button";
    }
    install.textContent = "Keep tools available offline";
    install.disabled = !serviceWorker;
    update.textContent = "Apply waiting update";
    update.disabled = !serviceWorker;
    install.addEventListener("click", async () => {
        install.disabled = true;
        note.textContent = "Saving public tools on this device. Keep this page open.";
        const state = await installer.enable();
        note.textContent = state === "failed" ? "Offline tools could not be saved. Your photo and edits are unchanged." :
            state === "ready" ? "Public tools are ready offline. Model and YouCam features still need their own resources." :
                state === "update_waiting" ? "An update is waiting. Save and reset edits before applying it." : "Installation is in progress. Check again before going offline.";
        install.disabled = false;
    });
    update.addEventListener("click", () => {
        const state = installer.refresh();
        if (state !== "update_waiting") {
            note.textContent = state === "ready" ? "Public tools are ready offline." : "No completed update is waiting yet.";
            return;
        }
        const result = installer.applyUpdate(hasEdits());
        note.textContent = result === "save_first" ? "Save your photo and reset the edits first. This page will keep its current version." :
            result === "applied" ? "Update accepted. Reopen the editor when you are ready; this page will not reload automatically." : "No update is waiting.";
    });
    panel.append(summary, note, install, update);
    host.append(panel);
    return () => panel.remove();
}
//# sourceMappingURL=install.js.map