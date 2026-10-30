import { InPageSeasonAlerts } from "./alerts.js";
import { SeasonContractError, validateSeasonBook, visibleSeasonBook } from "./contracts.js";
import { personalEvidence, savedLookEvidence, validateSeasonMatches } from "./personal.js";
import { editionOn, refreshDue } from "./schedule.js";
export const systemSeasonClock = {
    today() {
        return new Date().toISOString().slice(0, 10);
    },
};
export class SeasonBookController {
    savedLooks;
    clock;
    active = true;
    generation = 0;
    catalogue = null;
    matching = null;
    status = "not-wired";
    statusMessage = "Season Book is not connected to reviewed reporting.";
    pending = false;
    personalized = false;
    alertMessage = "";
    port = null;
    checkedOn = null;
    alerts = new InPageSeasonAlerts();
    subscribers = new Set();
    constructor(savedLooks, clock = systemSeasonClock) {
        this.savedLooks = savedLooks;
        this.clock = clock;
    }
    subscribe(listener) {
        this.subscribers.add(listener);
        listener(this.snapshot());
        return () => {
            this.subscribers.delete(listener);
        };
    }
    emit() {
        const next = this.snapshot();
        for (const listener of this.subscribers) {
            listener(next);
        }
    }
    snapshot() {
        return {
            status: this.status,
            book: this.catalogue,
            matches: this.matching,
            personalizePending: this.pending,
            personalized: this.personalized,
            alertOptedIn: this.alerts.optedIn,
            alertMessage: this.alertMessage,
            statusMessage: this.statusMessage,
            edition: editionOn(this.clock.today()),
        };
    }
    async connect(port) {
        if (!this.active) {
            return;
        }
        this.invalidate();
        this.port = port;
        if (typeof port.loadReviewedSeason !== "function") {
            this.status = "unverified";
            this.statusMessage = "No public Season Book source is available.";
            this.emit();
            return;
        }
        const ticket = ++this.generation;
        this.checkedOn = this.clock.today();
        this.status = "loading";
        this.statusMessage = "Checking seasonal reporting and sources.";
        this.emit();
        try {
            const raw = await port.loadReviewedSeason();
            const catalogue = visibleSeasonBook(validateSeasonBook(raw), this.clock.today());
            if (!this.current(ticket)) {
                return;
            }
            this.catalogue = catalogue;
            this.status = "ready";
            this.statusMessage = "Sourced reporting is ready for review.";
            this.emit();
        }
        catch (error) {
            if (!this.current(ticket)) {
                return;
            }
            this.status = error instanceof SeasonContractError ? "unverified" : "error";
            this.statusMessage = "Reviewed seasonal reporting is not available.";
            this.emit();
        }
    }
    /** Ask the connected source again if a new edition has opened since the last look or the
     * book has run out. Returns true when it asked. Never runs while a load is in flight. */
    async refreshIfDue() {
        if (!this.active || !this.port || this.status === "loading") {
            return false;
        }
        if (!refreshDue(this.checkedOn, this.clock.today(), this.catalogue)) {
            return false;
        }
        await this.connect(this.port);
        return true;
    }
    current(ticket) {
        return this.active && ticket === this.generation;
    }
    invalidate() {
        this.generation += 1;
        this.catalogue = null;
        this.matching = null;
        this.pending = false;
        this.personalized = false;
        this.alertMessage = "";
    }
    async personalizeFromUserAction() {
        if (!this.active || this.pending || !this.catalogue || !this.port) {
            return;
        }
        const port = this.port;
        if (typeof port.readShadeHistory !== "function" ||
            typeof port.readUndertoneProfile !== "function" ||
            typeof port.matchUsingWorkstreamF !== "function") {
            this.statusMessage = "Workstream F personal matching has not been connected.";
            this.emit();
            return;
        }
        const ticket = ++this.generation;
        this.pending = true;
        this.personalized = false;
        this.matching = null;
        this.alertMessage = "";
        this.emit();
        try {
            const [history, profile] = await Promise.all([
                port.readShadeHistory(),
                port.readUndertoneProfile(),
            ]);
            if (!this.current(ticket) || !this.catalogue) {
                return;
            }
            const evidence = personalEvidence(this.catalogue, this.savedLooks(), history, profile);
            if (!evidence.undertone?.confirmed) {
                throw new SeasonContractError("profile_required", "An explicit undertone profile is required");
            }
            const raw = await port.matchUsingWorkstreamF(evidence);
            if (!this.current(ticket)) {
                return;
            }
            const latestLooks = savedLookEvidence(this.savedLooks());
            if (JSON.stringify(latestLooks) !== JSON.stringify(evidence.savedLooks)) {
                throw new SeasonContractError("stale_saved_looks", "Saved look settings changed during matching");
            }
            const matches = validateSeasonMatches(raw, this.catalogue, evidence);
            this.matching = matches;
            this.personalized = true;
            this.statusMessage = matches.matches.length
                ? "Your season match is based on the supplied shade mapping."
                : "No supported match was returned for this profile.";
            this.alertMessage = this.alerts.issue(matches.seasonId, matches.mappingVersion, matches.matches.length)?.text ?? "";
        }
        catch {
            if (!this.current(ticket)) {
                return;
            }
            this.statusMessage = "No verified personal mapping is available. Your saved looks were not changed.";
            this.matching = null;
            this.personalized = false;
        }
        finally {
            if (this.current(ticket)) {
                this.pending = false;
                this.emit();
            }
        }
    }
    setInPageAlertsFromUserAction(checked) {
        if (!this.active) {
            return;
        }
        if (checked) {
            this.alerts.optInFromUserAction();
        }
        else {
            this.alerts.optOut();
        }
        this.alertMessage = "";
        this.emit();
    }
    resetPersonal() {
        this.generation += 1;
        this.pending = false;
        this.personalized = false;
        this.matching = null;
        this.alertMessage = "";
        this.emit();
    }
    disconnect() {
        if (!this.active) {
            return;
        }
        this.invalidate();
        this.port = null;
        this.checkedOn = null;
        this.status = "not-wired";
        this.statusMessage = "Season Book is not connected to reviewed reporting.";
        this.alerts.clear();
        this.emit();
    }
    dispose() {
        this.active = false;
        this.generation += 1;
        this.catalogue = null;
        this.matching = null;
        this.port = null;
        this.alerts.clear();
        this.subscribers.clear();
    }
}
//# sourceMappingURL=controller.js.map