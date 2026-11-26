export class CommerceNetworkError extends Error {
    code;
    status;
    constructor(code, status, message) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
const OFFLINE = "Everything here runs on this device, so nothing is sent anywhere.";
export class OfflineCommerceRemote {
    refuse() { return Promise.reject(new CommerceNetworkError("on_device", 0, OFFLINE)); }
    upload() { return this.refuse(); }
    match() { return this.refuse(); }
    tryOn() { return this.refuse(); }
    tryOnLook() { return this.refuse(); }
    bag() { return this.refuse(); }
    add() { return this.refuse(); }
    remove() { return this.refuse(); }
    wish() { return this.refuse(); }
    clear() { return this.refuse(); }
    removePhoto() { return this.refuse(); }
}
//# sourceMappingURL=remote.js.map