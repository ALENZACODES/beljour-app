export function judgeConnectionState(online) {
    if (online === false) {
        return {
            online,
            message: "Offline: local illustration can still work; live provider tools need a connection.",
            liveProviderAvailable: "not-checked",
            localDemoAvailable: true,
        };
    }
    if (online === true) {
        return {
            online,
            message: "This walkthrough is local even while connected. Live provider access is not tested here.",
            liveProviderAvailable: "not-checked",
            localDemoAvailable: true,
        };
    }
    return {
        online,
        message: "Connection status unavailable. This walkthrough never sends an image.",
        liveProviderAvailable: "not-checked",
        localDemoAvailable: true,
    };
}
export function readJudgeOnline(host) {
    const value = host.navigator?.onLine;
    return typeof value === "boolean" ? value : null;
}
export function observeJudgeConnection(browser, onChange) {
    let removed = false;
    const emit = () => {
        if (!removed)
            onChange(judgeConnectionState(readJudgeOnline(browser)));
    };
    browser.addEventListener("online", emit);
    browser.addEventListener("offline", emit);
    emit();
    return () => {
        if (removed)
            return;
        removed = true;
        browser.removeEventListener("online", emit);
        browser.removeEventListener("offline", emit);
    };
}
//# sourceMappingURL=judge-connectivity.js.map