# GNC Auth Entra Fix

- **Date:** 2026-05-29T15:29:10.202-05:00
- **Owner:** GNC
- **Context:** PR #7 auth middleware used HMAC validation with a fallback shared secret, which does not match the Entra ID design.
- **Decision:** Standardize API bearer-token validation on Microsoft Entra-compatible RS256 tokens verified through JWKS (`createRemoteJWKSet`) and allow local development only through an explicit non-production bypass flag.
- **Implications:** Production deployments must provide `AZURE_AD_TENANT_ID` and `AZURE_AD_CLIENT_ID`; integration tests should exercise asymmetric token validation with a JWKS endpoint; request IDs must be validated before being reflected into logs or responses.
