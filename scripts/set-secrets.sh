#!/bin/bash
# FastSaaS GitHub Secrets Setup Helper
# Sets all required secrets for staging deployment via gh CLI
# Make executable: chmod +x scripts/set-secrets.sh

set -e

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arrays to track results
declare -a SECRETS_SET
declare -a SECRETS_FAILED

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}Error: 'gh' CLI is not installed. Please install GitHub CLI first.${NC}"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}Error: Not authenticated with GitHub. Run 'gh auth login' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ gh CLI is installed and authenticated${NC}\n"

# Function to prompt for non-sensitive value
prompt_value() {
    local prompt_text="$1"
    local value
    read -p "$prompt_text: " value
    echo "$value"
}

# Function to prompt for sensitive value
prompt_secret() {
    local prompt_text="$1"
    local value
    read -sp "$prompt_text (input hidden): " value
    echo ""
    echo "$value"
}

# Function to set a secret
set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    
    if gh secret set "$secret_name" --body "$secret_value" 2>/dev/null; then
        SECRETS_SET+=("$secret_name")
        echo -e "${GREEN}✓ $secret_name set${NC}"
    else
        SECRETS_FAILED+=("$secret_name")
        echo -e "${YELLOW}✗ Failed to set $secret_name${NC}"
    fi
}

# Function to auto-generate PORTAL_NEXTAUTH_SECRET
generate_nextauth_secret() {
    openssl rand -base64 32
}

echo -e "${BLUE}=== FastSaaS GitHub Secrets Setup ===${NC}\n"

# SECTION 1: OIDC / Azure Authentication
echo -e "${BLUE}--- OIDC / Azure Authentication ---${NC}"
AZURE_OIDC_TENANT_ID=$(prompt_value "AZURE_OIDC_TENANT_ID (Tenant ID)")
set_secret "AZURE_OIDC_TENANT_ID" "$AZURE_OIDC_TENANT_ID"

AZURE_OIDC_CLIENT_ID=$(prompt_value "AZURE_OIDC_CLIENT_ID (Federated credential client ID)")
set_secret "AZURE_OIDC_CLIENT_ID" "$AZURE_OIDC_CLIENT_ID"

AZURE_SUBSCRIPTION_ID=$(prompt_value "AZURE_SUBSCRIPTION_ID (Azure subscription ID)")
set_secret "AZURE_SUBSCRIPTION_ID" "$AZURE_SUBSCRIPTION_ID"

echo ""

# SECTION 2: Entra App Registrations
echo -e "${BLUE}--- Entra App Registrations ---${NC}"
ENTRA_TENANT_ID=$(prompt_value "ENTRA_TENANT_ID (Shared Entra tenant ID)")
set_secret "ENTRA_TENANT_ID" "$ENTRA_TENANT_ID"

API_ENTRA_CLIENT_ID=$(prompt_value "API_ENTRA_CLIENT_ID (API app registration client ID)")
set_secret "API_ENTRA_CLIENT_ID" "$API_ENTRA_CLIENT_ID"

PORTAL_ENTRA_CLIENT_ID=$(prompt_value "PORTAL_ENTRA_CLIENT_ID (Portal app registration client ID)")
set_secret "PORTAL_ENTRA_CLIENT_ID" "$PORTAL_ENTRA_CLIENT_ID"

PORTAL_ENTRA_CLIENT_SECRET=$(prompt_secret "PORTAL_ENTRA_CLIENT_SECRET (Portal app registration secret)")
set_secret "PORTAL_ENTRA_CLIENT_SECRET" "$PORTAL_ENTRA_CLIENT_SECRET"

echo ""

# SECTION 3: Portal Authentication
echo -e "${BLUE}--- Portal Authentication ---${NC}"
read -p "Auto-generate PORTAL_NEXTAUTH_SECRET? (y/n, default: y): " auto_gen
auto_gen=${auto_gen:-y}

if [[ "$auto_gen" =~ ^[Yy]$ ]]; then
    PORTAL_NEXTAUTH_SECRET=$(generate_nextauth_secret)
    echo -e "${GREEN}Generated PORTAL_NEXTAUTH_SECRET${NC}"
else
    PORTAL_NEXTAUTH_SECRET=$(prompt_secret "PORTAL_NEXTAUTH_SECRET (NextAuth session signing secret)")
fi
set_secret "PORTAL_NEXTAUTH_SECRET" "$PORTAL_NEXTAUTH_SECRET"

echo ""

# SECTION 4: Marketplace
echo -e "${BLUE}--- Marketplace ---${NC}"
MARKETPLACE_CLIENT_ID=$(prompt_value "MARKETPLACE_CLIENT_ID (Microsoft Marketplace app registration client ID)")
set_secret "MARKETPLACE_CLIENT_ID" "$MARKETPLACE_CLIENT_ID"

MARKETPLACE_TENANT_ID=$(prompt_value "MARKETPLACE_TENANT_ID (Microsoft Marketplace app registration tenant ID)")
set_secret "MARKETPLACE_TENANT_ID" "$MARKETPLACE_TENANT_ID"

MARKETPLACE_CLIENT_SECRET=$(prompt_secret "MARKETPLACE_CLIENT_SECRET (Microsoft Marketplace client secret for OAuth token exchange)")
set_secret "MARKETPLACE_CLIENT_SECRET" "$MARKETPLACE_CLIENT_SECRET"

read -p "Auto-generate MARKETPLACE_WEBHOOK_SECRET? (y/n, default: y): " auto_gen_webhook
auto_gen_webhook=${auto_gen_webhook:-y}

if [[ "$auto_gen_webhook" =~ ^[Yy]$ ]]; then
    MARKETPLACE_WEBHOOK_SECRET=$(openssl rand -base64 32)
    echo -e "${GREEN}Generated MARKETPLACE_WEBHOOK_SECRET${NC}"
else
    MARKETPLACE_WEBHOOK_SECRET=$(prompt_secret "MARKETPLACE_WEBHOOK_SECRET (Marketplace webhook validation secret)")
fi
set_secret "MARKETPLACE_WEBHOOK_SECRET" "$MARKETPLACE_WEBHOOK_SECRET"

echo ""

# SECTION 5: Database
echo -e "${BLUE}--- Database ---${NC}"
STAGING_POSTGRES_ADMIN_PASSWORD=$(prompt_secret "STAGING_POSTGRES_ADMIN_PASSWORD (PostgreSQL admin password for staging)")
set_secret "STAGING_POSTGRES_ADMIN_PASSWORD" "$STAGING_POSTGRES_ADMIN_PASSWORD"

echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "${GREEN}Secrets set: ${#SECRETS_SET[@]}${NC}"
for secret in "${SECRETS_SET[@]}"; do
    echo "  ✓ $secret"
done

if [ ${#SECRETS_FAILED[@]} -gt 0 ]; then
    echo -e "${YELLOW}Secrets failed: ${#SECRETS_FAILED[@]}${NC}"
    for secret in "${SECRETS_FAILED[@]}"; do
        echo "  ✗ $secret"
    done
    exit 1
fi

echo -e "${GREEN}✓ All secrets set successfully!${NC}"
