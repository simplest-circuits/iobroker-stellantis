"use strict";

const axios = require("axios");
const { API_BASE, BRANDS } = require("./brands");

/**
 * Wrapper around the Stellantis Connected Car v4 API.
 * All requests require a valid Bearer token + x-introspect-realm header.
 */
class StellantisApi {
    /**
     * @param {object}       tokenManager - TokenManager instance
     * @param {string}       brandKey     - e.g. "MyPeugeot"
     * @param {string}       countryCode  - e.g. "de"
     */
    constructor(tokenManager, brandKey, countryCode) {
        this.tm = tokenManager;
        this.cfg = BRANDS[brandKey];
        this.countryCode = (countryCode || "de").toUpperCase();
        if (!this.cfg) throw new Error(`Unknown brand: ${brandKey}`);
    }

    async _headers() {
        const token = await this.tm.getAccessToken();
        return {
            Authorization: `Bearer ${token}`,
            "x-introspect-realm": this.cfg.realm,
            Accept: "application/hal+json",
            "Content-Type": "application/json",
            "User-Agent": "Swagger-Codegen/4.0/nodejs",
        };
    }

    async _get(path, params = {}) {
        const headers = await this._headers();
        const url = `${API_BASE}${path}`;
        const response = await axios.get(url, {
            headers,
            params: { ...params, client_id: this.cfg.client_id },
            timeout: 20_000,
        });
        return response.data;
    }

    async _post(path, data = {}) {
        const headers = await this._headers();
        const url = `${API_BASE}${path}`;
        const response = await axios.post(url, data, {
            headers,
            params: { client_id: this.cfg.client_id },
            timeout: 20_000,
        });
        return response.data;
    }

    // ── Vehicles ──────────────────────────────────────────────────────────────

    /** List all vehicles linked to the account. */
    async getVehicles() {
        const data = await this._get("/user/vehicles", { pageSize: 100 });
        return data?._embedded?.vehicles || [];
    }

    /**
     * Get full status for a single vehicle.
     * @param {string} vin
     */
    async getVehicleStatus(vin) {
        return await this._get(`/user/vehicles/${vin}/status`);
    }

    /**
     * Get the last known position.
     * @param {string} vin
     */
    async getLastPosition(vin) {
        return await this._get(`/user/vehicles/${vin}/lastPosition`);
    }

    /**
     * Get trip history (last N trips).
     * @param {string} vin
     * @param {number} n
     */
    async getTrips(vin, n = 10) {
        return await this._get(`/user/vehicles/${vin}/trips`, { pageSize: n });
    }

    // ── Remote commands ───────────────────────────────────────────────────────

    /**
     * Send a WakeUp command (triggers a fresh status push from the car).
     * @param {string} vin
     */
    async wakeUp(vin) {
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/wakeup`, {});
    }

    /**
     * Lock or unlock doors.
     * @param {string}  vin
     * @param {boolean} lock  - true = lock, false = unlock
     */
    async setDoorLock(vin, lock) {
        const action = lock ? "Locked" : "Unlocked";
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/doors`, {
            action,
        });
    }

    /**
     * Start or stop preconditioning (A/C).
     * @param {string}  vin
     * @param {boolean} start
     * @param {number}  [targetTemp] - Target temperature in Celsius (default 21)
     */
    async setPreconditioning(vin, start, targetTemp = 21) {
        const body = {
            action: start ? "StartAirConditioning" : "StopAirConditioning",
            airConditioning: {
                isEnabled: start,
                programs: [
                    {
                        slot: 1,
                        recurrence: "Immediate",
                        start: "T00:00:00",
                        temp: targetTemp,
                    },
                ],
            },
        };
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/airConditioning`, body);
    }

    /**
     * Start or stop charging (EV only).
     * @param {string}  vin
     * @param {boolean} start
     */
    async setCharging(vin, start) {
        const body = {
            action: start ? "StartCharge" : "StopCharge",
        };
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/charge`, body);
    }

    /**
     * Set charge limit (EV only).
     * @param {string} vin
     * @param {number} limit - 0–100 (percentage)
     */
    async setChargeLimit(vin, limit) {
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/charge`, {
            action: "SetChargeLimit",
            chargeLimit: Math.max(0, Math.min(100, limit)),
        });
    }

    /**
     * Flash lights.
     * @param {string} vin
     */
    async flashLights(vin) {
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/lights`, { action: "BlinkLights" });
    }

    /**
     * Honk horn.
     * @param {string} vin
     */
    async honk(vin) {
        return await this._post(`/user/vehicles/${vin}/callbacks/remoteservices/horn`, { action: "SoundHorn" });
    }
}

module.exports = StellantisApi;
