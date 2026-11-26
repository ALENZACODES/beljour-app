/** Opt-in attachment to an existing photo editor's local photo event stream.
 * The editor keeps control of navigation, privacy consent and model selection.
 * This adapter neither loads assets nor sends image data over the network.
 * Author: John Khan.
 */
import { mountHostProCommands, } from './host-bridge.js';
import { ProRenderError, checkedFrame } from './runtime.js';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function checkedPhoto(photo) {
    if (photo === null || typeof photo !== 'object' ||
        typeof photo.sessionKey !== 'string' || !KEY.test(photo.sessionKey) ||
        !Number.isSafeInteger(photo.revision) || photo.revision < 0 ||
        typeof photo.consentToLocalProcessing !== 'boolean' ||
        typeof photo.decodeLocal !== 'function') {
        throw new ProRenderError('invalid_editor_photo', 'The host photo descriptor is invalid.');
    }
}
function checkedEditor(editor) {
    if (editor === null || typeof editor !== 'object' ||
        typeof editor.currentPhoto !== 'function' ||
        typeof editor.subscribePhoto !== 'function') {
        throw new ProRenderError('invalid_editor_stream', 'A local photo event stream is required.');
    }
}
function copyPhoto(photo, frame) {
    const checked = checkedFrame(frame);
    return {
        sourceKey: photo.sessionKey,
        consentToLocalProcessing: true,
        pixels: {
            width: checked.width,
            height: checked.height,
            channels: checked.channels,
            pixels: new Uint8Array(checked.pixels),
        },
        regions: photo.regions,
        spots: photo.spots,
        pose: photo.pose,
    };
}
export function attachProToExistingEditor(options) {
    if (options === null || typeof options !== 'object') {
        throw new ProRenderError('invalid_editor_stream', 'Host attachment options are missing.');
    }
    checkedEditor(options.editor);
    if (typeof options.root?.append !== 'function') {
        throw new ProRenderError('invalid_editor_root', 'A mounted panel root is required.');
    }
    const listeners = new Set();
    const events = {
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
    };
    const emit = (event) => {
        for (const listener of listeners)
            listener(event);
    };
    const mount = options.mount ?? mountHostProCommands;
    const bridge = mount({
        root: options.root,
        identity: options.identity,
        events,
        codec: options.codec,
        onError: options.onError,
    });
    let active = true;
    let latestRequest = 0;
    let previousRevision = -1;
    let previousKey = null;
    let lastFailure = null;
    let pending = Promise.resolve();
    let unsubscribe = null;
    const notify = (code) => {
        lastFailure = code;
        try {
            options.onError?.(code);
        }
        catch { /* Caller diagnostics must not affect photo privacy or state. */ }
    };
    function transition(photo) {
        if (!active)
            return;
        const ticket = ++latestRequest;
        // Clear immediately before any await, including refused consent or a
        // decoder that never resolves. No former person's photo remains visible.
        emit({ type: 'clear' });
        if (photo === null) {
            previousKey = null;
            previousRevision = -1;
            lastFailure = null;
            pending = Promise.resolve();
            return;
        }
        try {
            checkedPhoto(photo);
            if (photo.sessionKey === previousKey && photo.revision <= previousRevision) {
                throw new ProRenderError('stale_editor_revision', 'The host photo revision was reused.');
            }
            previousKey = photo.sessionKey;
            previousRevision = photo.revision;
            if (!photo.consentToLocalProcessing) {
                throw new ProRenderError('local_processing_consent_required', 'Local photo processing consent is required.');
            }
        }
        catch (error) {
            notify(error instanceof ProRenderError ? error.code : 'invalid_editor_photo');
            pending = Promise.resolve();
            return;
        }
        pending = (async () => {
            try {
                const pixels = checkedFrame(await photo.decodeLocal());
                if (!active || ticket !== latestRequest)
                    return;
                // Only this verified revision may publish a photo to the Pro panel.
                emit({ type: 'photo', photo: copyPhoto(photo, pixels) });
                lastFailure = null;
            }
            catch (error) {
                if (!active || ticket !== latestRequest)
                    return;
                emit({ type: 'clear' });
                notify(error instanceof ProRenderError ? error.code : 'local_decode_failed');
            }
        })();
    }
    try {
        const beforeSubscribe = latestRequest;
        unsubscribe = options.editor.subscribePhoto(transition);
        if (typeof unsubscribe !== 'function') {
            throw new ProRenderError('invalid_editor_stream', 'Host stream did not return a disposer.');
        }
        // Prefer an event emitted during subscription to an older snapshot.
        if (latestRequest === beforeSubscribe)
            transition(options.editor.currentPhoto());
    }
    catch (error) {
        active = false;
        ++latestRequest;
        unsubscribe?.();
        bridge.dispose();
        throw error;
    }
    return {
        bridge,
        get active() { return active; },
        get lastFailure() { return lastFailure; },
        settle() { return pending; },
        dispose() {
            if (!active)
                return;
            active = false;
            ++latestRequest;
            unsubscribe?.();
            listeners.clear();
            bridge.dispose();
        },
    };
}
//# sourceMappingURL=host-shell-adapter.js.map