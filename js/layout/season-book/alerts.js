export class InPageSeasonAlerts {
    enabled = false;
    lastKey = "";
    get optedIn() {
        return this.enabled;
    }
    optInFromUserAction() {
        this.enabled = true;
    }
    optOut() {
        this.enabled = false;
        this.lastKey = "";
    }
    issue(seasonId, mappingVersion, count) {
        if (!this.enabled || count === 0) {
            return null;
        }
        if (typeof seasonId !== "string" || typeof mappingVersion !== "string") {
            return null;
        }
        if (!(Number.isSafeInteger(count) && count > 0 && count <= 12)) {
            return null;
        }
        const key = `${seasonId}|${mappingVersion}|${count}`;
        if (key === this.lastKey) {
            return null;
        }
        this.lastKey = key;
        return { seasonId, mappingVersion, count, text: "Your season match is in" };
    }
    clear() {
        this.optOut();
    }
}
