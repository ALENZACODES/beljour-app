export function connectivityCopy(snapshot) {
    if (!snapshot.online || snapshot.kind === "offline") {
        return {
            heading: "Connection appears offline",
            message: "Tools already open on this device may still work. " +
                "Cloud try-on needs a connection. Your photo stays in this tab.",
            retryLabel: null,
        };
    }
    if (snapshot.busy) {
        return {
            heading: "Checking the connection",
            message: "Your photo and edits remain unchanged.",
            retryLabel: null,
        };
    }
    if (snapshot.kind === "unavailable") {
        return {
            heading: "Cloud features are unavailable",
            message: "Local tools remain available. No photo or edit has been retried or uploaded.",
            retryLabel: "Check service again",
        };
    }
    if (snapshot.kind === "checking") {
        return {
            heading: "Service status not checked",
            message: "The editor stays available. Cloud work requires separate consent.",
            retryLabel: "Check service",
        };
    }
    return {
        heading: "Connected",
        message: "Cloud features still ask before sending a photo.",
        retryLabel: null,
    };
}
export class ConnectionTracker {
    online = true;
    kind = "checking";
    busy = false;
    sequence = 0;
    disposed = false;
    listeners = new Set();
    constructor(initialOnline = true) {
        this.online = initialOnline;
        if (!initialOnline)
            this.kind = "offline";
    }
    get snapshot() {
        return { kind: this.kind, online: this.online, busy: this.busy };
    }
    subscribe(listener) {
        if (this.disposed)
            return () => undefined;
        this.listeners.add(listener);
        listener(this.snapshot);
        return () => { this.listeners.delete(listener); };
    }
    setOnline(online) {
        if (this.disposed)
            return;
        if (this.online === online)
            return;
        this.online = online;
        this.sequence++;
        this.busy = false;
        this.kind = online ? "checking" : "offline";
        this.changed();
    }
    setService(available) {
        if (this.disposed || !this.online)
            return;
        this.sequence++;
        this.busy = false;
        this.kind = available ? "available" : "unavailable";
        this.changed();
    }
    /** Delayed responses are ignored after offline, another retry, or teardown. */
    async check(health) {
        if (this.disposed || !this.online || this.busy)
            return this.snapshot;
        const token = ++this.sequence;
        this.busy = true;
        this.changed();
        let available = false;
        try {
            available = await health() === true;
        }
        catch {
            available = false;
        }
        if (this.disposed || token !== this.sequence)
            return this.snapshot;
        this.busy = false;
        this.kind = available ? "available" : "unavailable";
        this.changed();
        return this.snapshot;
    }
    destroy() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.sequence++;
        this.listeners.clear();
    }
    changed() {
        const snapshot = this.snapshot;
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            }
            catch {
                // An optional status view must not stop the user's editor.
            }
        }
    }
}
export function mountConnectionNotice(doc, host, health) {
    const initialOnline = host.navigator?.onLine !== false;
    const tracker = new ConnectionTracker(initialOnline);
    const container = doc.createElement("section");
    container.className = "lg-client-connection";
    container.setAttribute("aria-label", "Connection status");
    container.hidden = true;
    const heading = doc.createElement("strong");
    const message = doc.createElement("p");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "lg-client-retry";
    button.addEventListener("click", () => {
        if (health)
            void tracker.check(health);
    });
    container.append(heading, message, button);
    const unsubscribe = tracker.subscribe((status) => {
        const copy = connectivityCopy(status);
        container.hidden = status.kind === "available" || (status.kind === "checking" && !health);
        container.dataset.state = status.kind;
        heading.textContent = copy.heading;
        message.textContent = copy.message;
        button.hidden = !health || copy.retryLabel === null;
        button.disabled = status.busy || !status.online;
        if (copy.retryLabel)
            button.textContent = copy.retryLabel;
    });
    const online = () => tracker.setOnline(true);
    const offline = () => tracker.setOnline(false);
    host.addEventListener("online", online);
    host.addEventListener("offline", offline);
    return {
        element: container,
        tracker,
        destroy() {
            unsubscribe();
            tracker.destroy();
            host.removeEventListener("online", online);
            host.removeEventListener("offline", offline);
            container.remove();
        },
    };
}
//# sourceMappingURL=connectivity.js.map