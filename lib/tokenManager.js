"use strict";

const axios = require("axios");
const { BRANDS, tokenEndpoint } = require("./brands");

/**
 * Manages OAuth2 tokens including PKCE exchange, refresh, and persistence.
 * Tokens are stored encrypted in ioBroker state "auth.tokens".
 */
class TokenManager {
    constructor(adapter, brandKey, countryCode) {
        this.adapter = adapter;
        this.brandKey = brandKey;
        this.countryCode = (countryCode || "de").toLowerCase();
        this.cfg = BRANDS[brandKey];
        if (!this.cfg) throw new Error(`Unknown brand: ${brandKey}`);

        this._accessToken = null;
        this._refreshToken = null;
        this._expiresAt = 0;
    }

    /**
     * Exchange an authorization code (+ PKCE verifier) for tokens.
     * @param {string} code          - Auth code from redirect URL
     * @param {string} codeVerifier  - PKCE verifier used when building the auth URL
     */
    async exchangeCode(code, codeVerifier) {
        this.adapter.log.info(`[Token] Exchanging auth code for ${this.brandKey}`);
        const redirectUri = this.cfg.redirect_uri_base + this.countryCode;
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        });
        await this._doTokenRequest(body);
        this.adapter.log.info("[Token] Exchange successful.");
    }

    /**
     * Returns a valid access token, refreshing if needed.
     */
    async getAccessToken() {
        if (!this._accessToken) await this._loadTokens();
        if (!this._accessToken) throw new Error("Not authenticated. Complete OAuth2 setup in adapter admin.");
        if (Date.now() >= this._expiresAt - 60_000) await this._refresh();
        return this._accessToken;
    }

    async _refresh() {
        if (!this._refreshToken) throw new Error("No refresh token. Re-authenticate.");
        this.adapter.log.debug("[Token] Refreshing...");
        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: this._refreshToken,
        });
        try {
            await this._doTokenRequest(body);
            this.adapter.log.debug("[Token] Refresh OK.");
        } catch (err) {
            this.adapter.log.error(`[Token] Refresh failed: ${err.message}`);
            throw err;
        }
    }

    async _doTokenRequest(body) {
        const url = tokenEndpoint(this.brandKey);
        const response = await axios.post(url, body.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
                Authorization: "Basic " + Buffer.from(`${this.cfg.client_id}:${this.cfg.client_secret}`).toString("base64"),
            },
            timeout: 20_000,
        });
        const d = response.data;
        this._accessToken = d.access_token;
        if (d.refresh_token) this._refreshToken = d.refresh_token;
        this._expiresAt = Date.now() + (d.expires_in || 3600) * 1000;
        await this._persist();
    }

    async _persist() {
        const val = JSON.stringify({
            a: this._accessToken,
            r: this._refreshToken,
            e: this._expiresAt,
        });
        await this.adapter.setStateAsync("auth.tokens", { val, ack: true });
    }

    async _loadTokens() {
        try {
            const st = await this.adapter.getStateAsync("auth.tokens");
            if (st && st.val) {
                const d = JSON.parse(st.val);
                this._accessToken = d.a || null;
                this._refreshToken = d.r || null;
                this._expiresAt = d.e || 0;
            }
        } catch {
            this.adapter.log.warn("[Token] Could not load stored tokens.");
        }
    }

    async clearTokens() {
        this._accessToken = null;
        this._refreshToken = null;
        this._expiresAt = 0;
        await this.adapter.setStateAsync("auth.tokens", { val: null, ack: true });
    }
}

module.exports = TokenManager;
