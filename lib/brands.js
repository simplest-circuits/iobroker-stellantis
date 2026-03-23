"use strict";

/**
 * Stellantis brand configuration.
 *
 * client_id / client_secret extracted from official mobile APKs.
 * Same values used by psa_car_controller and evcc (publicly documented).
 *
 * Auth flow since Jan 2024: OAuth2 Authorization Code + PKCE (S256)
 */

const crypto = require("crypto");

const BRANDS = {
    MyPeugeot: {
        label: "MyPeugeot",
        brand_tld: "peugeot.com",
        realm: "clientsB2CPeugeot",
        client_id: "1eebc2d5-5df3-459b-a624-20abfcf82530",
        client_secret: "T5tP7iS0cO8sC0lA2iE2aR7gK6uE5rF3lJ8pC3nO1pR7tL8vU1",
        redirect_uri_base: "mymap://oauth2redirect/",
        scope: "openid profile",
        api_brand: "AP",
    },
    MyCitroen: {
        label: "MyCitroën",
        brand_tld: "citroen.com",
        realm: "clientsB2CCitroen",
        client_id: "5cf2251a-e0ca-4c9e-bef7-bf5b0f2a44b1",
        client_secret: "T9tV7oI8dB8hL7iP4cG0eU9eP0uK8xP6hU5kL5gV7mN8uN0kS8",
        redirect_uri_base: "mymap://oauth2redirect/",
        scope: "openid profile",
        api_brand: "AC",
    },
    MyDS: {
        label: "MyDS",
        brand_tld: "driveds.com",
        realm: "clientsB2CDS",
        client_id: "5cf2251a-e0ca-4c9e-bef7-bf5b0f2a44b2",
        client_secret: "T9tV7oI8dB8hL7iP4cG0eU9eP0uK8xP6hU5kL5gV7mN8uN0kS9",
        redirect_uri_base: "mymap://oauth2redirect/",
        scope: "openid profile",
        api_brand: "DS",
    },
    MyOpel: {
        label: "MyOpel",
        brand_tld: "opel.com",
        realm: "clientsB2COpel",
        client_id: "07364655-93cb-4194-8158-6b035ac2a24c",
        client_secret: "F2tJ9wI8dC0hT8iJ3cC3eH7eF4nF8mI4xL4vO4fA2aR2qS7wT5",
        redirect_uri_base: "mymap://oauth2redirect/",
        scope: "openid profile",
        api_brand: "OP",
    },
    MyVauxhall: {
        label: "MyVauxhall",
        brand_tld: "vauxhall.co.uk",
        realm: "clientsB2CVauxhall",
        client_id: "07364655-93cb-4194-8158-6b035ac2a24d",
        client_secret: "G5tK1wI4dC7hT2iN3cA5eH2eF0nI8mJ4yL1vP3fA4aR8qS1wT3",
        redirect_uri_base: "mymap://oauth2redirect/",
        scope: "openid profile",
        api_brand: "VX",
    },
};

const API_BASE = "https://api.groupe-psa.com/connectedcar/v4";

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

function generateState() {
    return crypto.randomBytes(16).toString("base64url");
}

function buildAuthUrl(brandKey, countryCode, state, codeChallenge) {
    const cfg = BRANDS[brandKey];
    if (!cfg) throw new Error(`Unknown brand: ${brandKey}`);
    const cc = (countryCode || "de").toLowerCase();
    const redirectUri = cfg.redirect_uri_base + cc;
    const params = new URLSearchParams({
        client_id: cfg.client_id,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: cfg.scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });
    return `https://idpcvs.${cfg.brand_tld}/am/oauth2/authorize?${params.toString()}`;
}

function tokenEndpoint(brandKey) {
    const cfg = BRANDS[brandKey];
    return `https://idpcvs.${cfg.brand_tld}/am/oauth2/access_token`;
}

module.exports = { BRANDS, API_BASE, generatePKCE, generateState, buildAuthUrl, tokenEndpoint };
