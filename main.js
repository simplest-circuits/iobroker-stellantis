"use strict";

/**
 * ioBroker Stellantis Adapter
 *
 * Supports: MyPeugeot, MyCitroën, MyDS, MyOpel, MyVauxhall
 * Auth:     OAuth2 Authorization Code Flow + PKCE (required since Jan 2024)
 * API:      Stellantis Connected Car v4
 *
 * Setup flow:
 *  1. User selects brand + country in admin UI
 *  2. Adapter generates PKCE verifier/challenge + state, stores them, shows the auth URL
 *  3. User opens the URL in a browser, logs in
 *  4. User copies the authorization code (from the redirect URL) into admin UI
 *  5. Adapter exchanges code for tokens and starts polling
 */

const utils = require("@iobroker/adapter-core");
const { BRANDS, generatePKCE, generateState, buildAuthUrl } = require("./lib/brands");
const TokenManager = require("./lib/tokenManager");
const StellantisApi = require("./lib/api");
const { writeVehicleStatus } = require("./lib/stateHelper");

class StellantisAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: "stellantis" });

        this.tokenManager = null;
        this.api = null;
        this.vehicles = []; // cached vehicle list
        this.pollTimer = null;
        this._pkceSession = null; // { verifier, challenge, state } during setup

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    async onReady() {
        try {
            this.log.info("Stellantis adapter starting...");
            this.log.info("Ensuring auth state objects...");

            // Ensure auth state objects exist
            await this.setObjectNotExistsAsync("auth.tokens", {
                type: "state",
                common: { name: "Stored OAuth tokens (JSON)", type: "string", role: "text", read: false, write: false, def: null },
                native: {},
            });
            this.log.info("Auth state object auth.tokens ready.");

            await this.setObjectNotExistsAsync("auth.pkce", {
                type: "state",
                common: { name: "PKCE session (JSON, temporary)", type: "string", role: "text", read: false, write: false, def: null },
                native: {},
            });
            this.log.info("Auth state object auth.pkce ready.");

            const brand = this.config.brand;
            const country = this.config.countryCode || "de";
            this.log.info(`Configured brand/country: ${brand || "n/a"}/${country}`);

            if (!brand || !BRANDS[brand]) {
                this.log.warn("No brand configured. Open adapter settings to complete setup.");
                await this.setStateAsync("info.connection", { val: false, ack: true });
                return;
            }

            this.tokenManager = new TokenManager(this, brand, country);
            this.api = new StellantisApi(this.tokenManager, brand, country);
            this.log.info("Token manager and API client initialized.");

            // Try connecting with stored tokens
            try {
                await this.tokenManager.getAccessToken();
                await this.setStateAsync("info.connection", { val: true, ack: true });
                this.log.info("Authenticated. Starting vehicle polling.");
                await this.pollAll();
                this.subscribeStates("*.commands.*");
            } catch (err) {
                this.log.warn(`Not authenticated yet: ${err.message}`);
                await this.setStateAsync("info.connection", { val: false, ack: true });
            }
        } catch (err) {
            this.log.error(`onReady failed: ${err.message}`);
            await this.setStateAsync("info.connection", { val: false, ack: true });
        }
    }

    onUnload(callback) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        callback();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Polling
    // ──────────────────────────────────────────────────────────────────────────

    async pollAll() {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.log.info("Polling cycle started.");

        try {
            // Refresh vehicle list every poll cycle (cheap call)
            this.vehicles = await this.api.getVehicles();
            this.log.info(`Found ${this.vehicles.length} vehicle(s).`);

            for (const v of this.vehicles) {
                const vin = v.vin || v.id;
                if (!vin) {
                    this.log.warn("Skipping vehicle entry without VIN/id.");
                    continue;
                }
                try {
                    const status = await this.api.getVehicleStatus(vin);
                    await writeVehicleStatus(this, vin, status, v);
                    this.log.info(`Updated status for ${vin}`);
                } catch (err) {
                    this.log.warn(`Could not fetch status for ${vin}: ${err.message}`);
                }
            }

            await this.setStateAsync("info.connection", { val: true, ack: true });
            this.log.info("Polling cycle finished successfully.");
        } catch (err) {
            this.log.error(`Poll failed: ${err.message}`);
            await this.setStateAsync("info.connection", { val: false, ack: true });
        }

        // Schedule next poll (default 10 min, configurable)
        const intervalMin = Math.max(2, parseInt(this.config.pollInterval) || 10);
        this.log.info(`Next polling cycle in ${intervalMin} minute(s).`);
        this.pollTimer = setTimeout(() => this.pollAll(), intervalMin * 60 * 1000);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // State changes (remote commands)
    // ──────────────────────────────────────────────────────────────────────────

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        if (!this.api) return;

        // id pattern: stellantis.0.<VIN>.commands.<cmd>
        const parts = id.split(".");
        // find the .commands. index
        const cmdIdx = parts.indexOf("commands");
        if (cmdIdx < 0) return;

        const vin = parts.slice(2, cmdIdx).join(".");
        const cmd = parts[cmdIdx + 1];

        this.log.info(`Command received: ${cmd} for VIN ${vin}`);

        try {
            switch (cmd) {
                case "wakeUp":
                    await this.api.wakeUp(vin);
                    // refresh status after a short delay
                    setTimeout(() => this.pollAll(), 5000);
                    break;
                case "doorLock":
                    await this.api.setDoorLock(vin, state.val === true);
                    break;
                case "startPreconditioning":
                    if (state.val) await this.api.setPreconditioning(vin, true, parseInt(this.config.precondTemp) || 21);
                    break;
                case "stopPreconditioning":
                    if (state.val) await this.api.setPreconditioning(vin, false);
                    break;
                case "startCharging":
                    if (state.val) await this.api.setCharging(vin, true);
                    break;
                case "stopCharging":
                    if (state.val) await this.api.setCharging(vin, false);
                    break;
                case "chargeLimit":
                    await this.api.setChargeLimit(vin, parseInt(state.val));
                    break;
                case "flashLights":
                    if (state.val) await this.api.flashLights(vin);
                    break;
                case "honk":
                    if (state.val) await this.api.honk(vin);
                    break;
                default:
                    this.log.warn(`Unknown command: ${cmd}`);
            }
        } catch (err) {
            this.log.error(`Command ${cmd} failed: ${err.message}`);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Admin messages (OAuth2 setup flow)
    // ──────────────────────────────────────────────────────────────────────────

    async onMessage(obj) {
        if (!obj || !obj.command) return;

        switch (obj.command) {
            // Step 1: Admin requests the auth URL
            case "getAuthUrl": {
                const brand = obj.message?.brand || this.config.brand;
                const country = (obj.message?.countryCode || this.config.countryCode || "de").toLowerCase();

                if (!brand || !BRANDS[brand]) {
                    this.sendTo(obj.from, obj.command, { error: "Invalid brand selected." }, obj.callback);
                    return;
                }

                const pkce = generatePKCE();
                const state = generateState();
                this._pkceSession = { verifier: pkce.verifier, state, brand, country };

                // Persist PKCE session so it survives adapter restarts during setup
                await this.setStateAsync("auth.pkce", {
                    val: JSON.stringify(this._pkceSession),
                    ack: true,
                });

                const url = buildAuthUrl(brand, country, state, pkce.challenge);
                this.log.info(`Auth URL generated for ${brand}: ${url}`);
                this.sendTo(obj.from, obj.command, { url }, obj.callback);
                break;
            }

            // Step 2: Admin submits the authorization code
            case "submitAuthCode": {
                const code = (obj.message?.code || "").trim();
                if (!code) {
                    this.sendTo(obj.from, obj.command, { error: "No code provided." }, obj.callback);
                    return;
                }

                // Restore PKCE session if needed
                if (!this._pkceSession) {
                    try {
                        const st = await this.getStateAsync("auth.pkce");
                        if (st?.val) this._pkceSession = JSON.parse(st.val);
                    } catch {
                        /* ignore */
                    }
                }

                if (!this._pkceSession) {
                    this.sendTo(obj.from, obj.command, { error: "PKCE session expired. Please restart the auth flow." }, obj.callback);
                    return;
                }

                const { verifier, brand, country } = this._pkceSession;

                try {
                    if (!this.tokenManager || this.tokenManager.brandKey !== brand) {
                        this.tokenManager = new TokenManager(this, brand, country);
                        this.api = new StellantisApi(this.tokenManager, brand, country);
                    }
                    await this.tokenManager.exchangeCode(code, verifier);
                    this._pkceSession = null;
                    await this.setStateAsync("auth.pkce", { val: null, ack: true });
                    await this.setStateAsync("info.connection", { val: true, ack: true });

                    // Start polling
                    await this.pollAll();
                    this.subscribeStates("*.commands.*");

                    this.sendTo(obj.from, obj.command, { success: true }, obj.callback);
                    this.log.info("OAuth2 setup complete!");
                } catch (err) {
                    this.log.error(`Auth code exchange failed: ${err.message}`);
                    this.sendTo(obj.from, obj.command, { error: err.message }, obj.callback);
                }
                break;
            }

            // Force refresh vehicle data
            case "refreshNow": {
                try {
                    await this.pollAll();
                    this.sendTo(obj.from, obj.command, { success: true }, obj.callback);
                } catch (err) {
                    this.sendTo(obj.from, obj.command, { error: err.message }, obj.callback);
                }
                break;
            }

            // Clear stored tokens (force re-auth)
            case "clearTokens": {
                if (this.tokenManager) await this.tokenManager.clearTokens();
                await this.setStateAsync("info.connection", { val: false, ack: true });
                this.sendTo(obj.from, obj.command, { success: true }, obj.callback);
                break;
            }

            default:
                this.log.warn(`Unknown message command: ${obj.command}`);
        }
    }
}

// Create adapter instance
if (require.main !== module) {
    module.exports = (options) => new StellantisAdapter(options);
} else {
    new StellantisAdapter();
}
