let source = null;
let context = null;
let mounted = null;
let revision = 0;
async function activate() {
    const ticket = ++revision;
    const selectedSource = source;
    const selectedContext = context;
    if (!selectedSource || !selectedContext) {
        return;
    }
    try {
        const { SeasonBookSurface } = await import("./surface.js");
        if (ticket !== revision || source !== selectedSource || context !== selectedContext) {
            return;
        }
        mounted?.dispose();
        const next = new SeasonBookSurface(selectedContext.doc, selectedContext.getSavedLooks);
        mounted = next;
        await next.connect(selectedSource);
    }
    catch {
        // An unavailable optional seasonal bundle cannot break the Home screen.
    }
}
export function mountSeasonBook(doc, getSavedLooks) {
    revision += 1;
    mounted?.dispose();
    mounted = null;
    context = { doc, getSavedLooks };
    if (source) {
        void activate();
    }
}
export function registerSeasonBookPort(port) {
    source = port;
    if (context) {
        void activate();
    }
}
export function unregisterSeasonBookPort() {
    revision += 1;
    source = null;
    mounted?.dispose();
    mounted = null;
}
