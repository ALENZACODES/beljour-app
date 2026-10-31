import { SeasonBookController } from "./controller.js";
import { renderSeasonBook } from "./view.js";
export class SeasonBookSurface {
    doc;
    controller;
    root;
    rail;
    unsubscribe = null;
    onVisible;
    constructor(doc, getSavedLooks) {
        this.doc = doc;
        this.root = doc.getElementById("lg-season-book-root");
        this.rail = doc.getElementById("lg-editorial-calendar-rail");
        this.controller = new SeasonBookController(getSavedLooks);
        // A new edition is picked up when Home comes back into view; nothing polls in the background.
        this.onVisible = () => {
            if (doc.visibilityState !== "hidden") {
                void this.controller.refreshIfDue();
            }
        };
        doc.addEventListener("visibilitychange", this.onVisible);
        if (this.root) {
            this.unsubscribe = this.controller.subscribe((state) => {
                if (!this.root) {
                    return;
                }
                renderSeasonBook(doc, this.root, state, {
                    personalize: () => {
                        void this.controller.personalizeFromUserAction();
                    },
                    setAlerts: (enabled) => {
                        this.controller.setInPageAlertsFromUserAction(enabled);
                    },
                    clearPersonal: () => {
                        this.controller.resetPersonal();
                    },
                });
                if (this.rail) {
                    const holiday = doc.getElementById("lg-holiday-engine-slot");
                    this.rail.hidden = this.root.hidden && (holiday?.hidden ?? true);
                }
            });
        }
    }
    async connect(port) {
        await this.controller.connect(port);
    }
    disconnect() {
        this.controller.disconnect();
    }
    dispose() {
        this.doc.removeEventListener("visibilitychange", this.onVisible);
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.controller.dispose();
        if (this.root) {
            this.root.replaceChildren();
            this.root.hidden = true;
        }
        if (this.rail) {
            const holiday = this.rail.querySelector("#lg-holiday-engine-slot");
            this.rail.hidden = holiday?.hidden ?? true;
        }
    }
}
