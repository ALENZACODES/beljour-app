/** Explicitly consented transport for the existing key-proxy origin; no vendor SDK.
 * Requests are never sent to YouCam from a browser. Upload is opt-in only and metadata
 * is stripped by the caller using the canvas encoder. Author: John Khan.
 */
import { ApiError, commerceTransport } from "../api.js";
export class CommerceNetworkError extends Error {
    code;
    status;
    constructor(code, status, message) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
async function request(path, data, method) {
    try {
        return await commerceTransport({ endpoint: path, method, payload: data });
    }
    catch (reason) {
        if (reason instanceof ApiError) {
            throw new CommerceNetworkError(reason.code, reason.status, reason.message);
        }
        throw new CommerceNetworkError("connection", 0, "Unable to reach the service. Your photo and recipe remain on this device.");
    }
}
export class KeyProxyCommerceRemote {
    async upload(blob) {
        if (!(blob instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(blob.type) ||
            blob.size > 8_000_000 || blob.size === 0)
            throw Error("Select a supported photo under 8 MB.");
        const form = new FormData();
        form.append("file", blob, "consented-photo.jpg");
        return request("/api/photos", form);
    }
    match(body) {
        return request("/api/commerce/match", { ...body });
    }
    tryOn(body) {
        return request("/api/commerce/try-on", { ...body });
    }
    tryOnLook(body) {
        return request("/api/commerce/look/try-on", { ...body });
    }
    bag() { return request("/api/commerce/bag"); }
    add(product_id, quantity = 1) {
        return request("/api/commerce/bag/add", { product_id, quantity });
    }
    remove(product_id) {
        return request("/api/commerce/bag/remove", { product_id });
    }
    wish(product_id, selected) {
        return request("/api/commerce/wishlist", { product_id, selected });
    }
    clear() { return request("/api/commerce/bag/clear", {}); }
    removePhoto(photo_id) {
        if (!/^[0-9a-f]{64}$/.test(photo_id))
            throw Error("Invalid photo reference");
        return request(`/api/photos/${photo_id}`, undefined, "DELETE");
    }
}
