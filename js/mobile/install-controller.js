/** PWA lifecycle adapter: opt-in, no auto-update and no provider/photo access. */
import { InstallState } from "./install-state.js";
import { clearPublicShellStorage, inspectPublicShellStorage, } from "./install-storage.js";
export function installationBrowserPort(browser) {
    const nav = browser.navigator;
    const standalone = browser.matchMedia?.("(display-mode: standalone)")?.matches === true;
    const secure = browser.isSecureContext === true;
    return {
        capabilities: {
            secure,
            worker: Boolean(nav.serviceWorker),
            standalone,
        },
        workers: nav.serviceWorker ?? null,
        caches: typeof browser.caches === "object" ? browser.caches : null,
        storage: nav.storage ?? null,
        onLine: () => typeof nav.onLine === "boolean" ? nav.onLine : null,
        addEventListener: (name, listener) => browser.addEventListener(name, listener),
        removeEventListener: (name, listener) => browser.removeEventListener(name, listener),
    };
}
/** No registration happens in the constructor. A visitor must press Enable. */
export function createInstallController(port) {
    const state = new InstallState(port.capabilities);
    let registered = null;
    let offered = null;
    let disposed = false;
    const updateFound = () => {
        // An installing worker is not ready to apply until waiting is confirmed.
        if (!disposed)
            state.setUpdateWaiting(isOurWorker(registered?.waiting));
    };
    const changed = () => {
        if (!disposed) {
            state.appliedUpdate();
            void refreshRegistration();
        }
    };
    const offeredPrompt = (event) => {
        const candidate = event;
        if (disposed || typeof candidate.prompt !== "function")
            return;
        candidate.preventDefault();
        offered = candidate;
        state.promptAvailable();
    };
    const installed = () => {
        if (!disposed)
            state.installed();
        offered = null;
    };
    function isOurWorker(worker) {
        if (!worker?.scriptURL)
            return false;
        try {
            return new URL(worker.scriptURL).pathname.endsWith("/service-worker.js");
        }
        catch {
            return false;
        }
    }
    function observeRegistration(value) {
        registered?.removeEventListener("updatefound", updateFound);
        registered = value;
        registered?.addEventListener("updatefound", updateFound);
        if (!disposed)
            state.setUpdateWaiting(isOurWorker(registered?.waiting));
    }
    async function refreshRegistration() {
        if (!port.workers)
            return;
        try {
            const current = await port.workers.getRegistration();
            if (!disposed && current)
                observeRegistration(current);
        }
        catch {
            // Missing service-worker access is not an editor error.
        }
    }
    port.addEventListener("beforeinstallprompt", offeredPrompt);
    port.addEventListener("appinstalled", installed);
    port.workers?.addEventListener("controllerchange", changed);
    // Reading registration status is safe; it never installs or updates a worker.
    void refreshRegistration();
    return {
        state,
        subscribe: (listener) => state.subscribe(listener),
        async enableOffline() {
            if (disposed || !port.capabilities.secure || !port.capabilities.worker || !port.workers)
                return;
            state.setOffline("enabling");
            try {
                const result = await port.workers.register("service-worker.js", { scope: "./" });
                if (disposed)
                    return;
                observeRegistration(result);
                state.setOffline("ready");
            }
            catch {
                if (!disposed)
                    state.setOffline("error", "registration");
            }
        },
        async requestInstall() {
            if (disposed || !offered || state.snapshot.install !== "prompt-ready")
                return;
            const pending = offered;
            offered = null;
            try {
                state.promptStarted();
                await pending.prompt();
                const choice = await pending.userChoice;
                if (!disposed)
                    state.promptChoice(choice.outcome === "accepted");
            }
            catch {
                if (!disposed)
                    state.promptFailed();
            }
        },
        inspectStorage: () => inspectPublicShellStorage(port.caches, port.storage, port.onLine()),
        async clearCache() {
            if (disposed || !port.caches)
                return 0;
            const cleared = await clearPublicShellStorage(port.caches);
            if (!disposed && cleared > 0)
                state.setOffline("available");
            return cleared;
        },
        confirmSavedWork: (confirmed) => state.confirmSavedWork(confirmed),
        applyUpdate() {
            if (disposed || !state.canApplyUpdate() || !isOurWorker(registered?.waiting))
                return false;
            try {
                registered.waiting.postMessage({ type: "BELJOUR_ACTIVATE_AFTER_SAVE" });
                state.appliedUpdate();
                return true;
            }
            catch {
                return false;
            }
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            port.removeEventListener("beforeinstallprompt", offeredPrompt);
            port.removeEventListener("appinstalled", installed);
            port.workers?.removeEventListener("controllerchange", changed);
            registered?.removeEventListener("updatefound", updateFound);
            registered = null;
            offered = null;
            state.dispose();
        },
    };
}
