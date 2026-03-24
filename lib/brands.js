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
        scope: "openid profile email",
        api_brand: "AP",
    },
    MyCitroen: {
        label: "MyCitroën",
        brand_tld: "citroen.com",
        realm: "clientsB2CCitroen",
        client_id: "5364defc-80e6-447b-bec6-4af8d1542cae",
        client_secret: "iE0cD8bB0yJ0dS6rO3nN1hI2wU7uA5xR4gP7lD6vM0oH0nS8dN",
        redirect_uri_base: "mymacsdk://oauth2redirect/",
        scope: "openid profile email",
        api_brand: "AC",
    },
    MyDS: {
        label: "MyDS",
        brand_tld: "driveds.com",
        realm: "clientsB2CDS",
        client_id: "cbf74ee7-a303-4c3d-aba3-29f5994e2dfa",
        client_secret: "X6bE6yQ3tH1cG5oA6aW4fS6hK0cR0aK5yN2wE4hP8vL8oW5gU3",
        redirect_uri_base: "mymdssdk://oauth2redirect/",
        scope: "openid profile email",
        api_brand: "DS",
    },
    MyOpel: {
        label: "MyOpel",
        brand_tld: "opel.com",
        realm: "clientsB2COpel",
        client_id: "07364655-93cb-4194-8158-6b035ac2c24c",
        client_secret: "F2kK7lC5kF5qN7tM0wT8kE3cW1dP0wC5pI6vC0sQ5iP5cN8cJ8",
        redirect_uri_base: "mymopsdk://oauth2redirect/",
        scope: "openid profile email",
        api_brand: "OP",
    },
    MyVauxhall: {
        label: "MyVauxhall",
        brand_tld: "vauxhall.co.uk",
        realm: "clientsB2CVauxhall",
        client_id: "122f3511-4f74-4a0c-bcda-af2f3b2e3a65",
        client_secret: "N1iY3jO4jI1sF2yS6yJ3rG7xQ4kL4kK1dO3xT5uX6dF3kW8gI6",
        redirect_uri_base: "mymvxsdk://oauth2redirect/",
        scope: "openid profile email",
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
