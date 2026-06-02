# FastSaaS GitHub Secrets Setup Helper
# Sets all required secrets for staging deployment via gh CLI
# Run from PowerShell as: .\scripts\set-secrets.ps1

$ErrorActionPreference = "Stop"

# Color codes for output
$Green = "Green"
$Blue = "Blue"
$Yellow = "Yellow"

# Arrays to track results
$SecretsSet = @()
$SecretsFailed = @()

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor $Blue

$ghExists = $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
if (-not $ghExists) {
    Write-Host "Error: 'gh' CLI is not installed. Please install GitHub CLI first." -ForegroundColor $Yellow
    exit 1
}

$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Not authenticated with GitHub. Run 'gh auth login' first." -ForegroundColor $Yellow
    exit 1
}

Write-Host "✓ gh CLI is installed and authenticated" -ForegroundColor $Green
Write-Host ""

# Function to prompt for non-sensitive value
function Prompt-Value {
    param([string]$PromptText)
    $value = Read-Host $PromptText
    return $value
}

# Function to prompt for sensitive value
function Prompt-Secret {
    param([string]$PromptText)
    $value = Read-Host "$PromptText (input hidden)" -AsSecureString
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($value))
}

# Function to set a secret
function Set-Secret {
    param([string]$SecretName, [string]$SecretValue)
    
    try {
        gh secret set $SecretName --body $SecretValue 2>&1 | Out-Null
        $script:SecretsSet += $SecretName
        Write-Host "✓ $SecretName set" -ForegroundColor $Green
    } catch {
        $script:SecretsFailed += $SecretName
        Write-Host "✗ Failed to set $SecretName" -ForegroundColor $Yellow
    }
}

# Function to auto-generate PORTAL_NEXTAUTH_SECRET
function Generate-NextAuthSecret {
    $bytes = 1..32 | ForEach-Object { Get-Random -Maximum 256 }
    return [Convert]::ToBase64String([byte[]]$bytes)
}

Write-Host "=== FastSaaS GitHub Secrets Setup ===" -ForegroundColor $Blue
Write-Host ""

# SECTION 1: OIDC / Azure Authentication
Write-Host "--- OIDC / Azure Authentication ---" -ForegroundColor $Blue
$AZURE_OIDC_CLIENT_ID = Prompt-Value "AZURE_OIDC_CLIENT_ID (Federated credential client ID)"
Set-Secret "AZURE_OIDC_CLIENT_ID" $AZURE_OIDC_CLIENT_ID

$AZURE_OIDC_TENANT_ID = Prompt-Value "AZURE_OIDC_TENANT_ID (Tenant ID)"
Set-Secret "AZURE_OIDC_TENANT_ID" $AZURE_OIDC_TENANT_ID

$AZURE_SUBSCRIPTION_ID = Prompt-Value "AZURE_SUBSCRIPTION_ID (Azure subscription ID)"
Set-Secret "AZURE_SUBSCRIPTION_ID" $AZURE_SUBSCRIPTION_ID

Write-Host ""

# SECTION 2: Entra App Registrations
Write-Host "--- Entra App Registrations ---" -ForegroundColor $Blue
$ENTRA_TENANT_ID = Prompt-Value "ENTRA_TENANT_ID (Shared Entra tenant ID)"
Set-Secret "ENTRA_TENANT_ID" $ENTRA_TENANT_ID

$API_ENTRA_CLIENT_ID = Prompt-Value "API_ENTRA_CLIENT_ID (API app registration client ID)"
Set-Secret "API_ENTRA_CLIENT_ID" $API_ENTRA_CLIENT_ID

$PORTAL_ENTRA_CLIENT_ID = Prompt-Value "PORTAL_ENTRA_CLIENT_ID (Portal app registration client ID)"
Set-Secret "PORTAL_ENTRA_CLIENT_ID" $PORTAL_ENTRA_CLIENT_ID

$PORTAL_ENTRA_CLIENT_SECRET = Prompt-Secret "PORTAL_ENTRA_CLIENT_SECRET (Portal app registration secret)"
Set-Secret "PORTAL_ENTRA_CLIENT_SECRET" $PORTAL_ENTRA_CLIENT_SECRET

Write-Host ""

# SECTION 3: Portal Authentication
Write-Host "--- Portal Authentication ---" -ForegroundColor $Blue
$autoGenPrompt = Read-Host "Auto-generate PORTAL_NEXTAUTH_SECRET? (y/n, default: y)"
if ([string]::IsNullOrEmpty($autoGenPrompt) -or $autoGenPrompt -match '^[Yy]$') {
    $PORTAL_NEXTAUTH_SECRET = Generate-NextAuthSecret
    Write-Host "Generated PORTAL_NEXTAUTH_SECRET" -ForegroundColor $Green
} else {
    $PORTAL_NEXTAUTH_SECRET = Prompt-Secret "PORTAL_NEXTAUTH_SECRET (NextAuth session signing secret)"
}
Set-Secret "PORTAL_NEXTAUTH_SECRET" $PORTAL_NEXTAUTH_SECRET

Write-Host ""

# SECTION 4: Marketplace
Write-Host "--- Marketplace ---" -ForegroundColor $Blue
$MARKETPLACE_CLIENT_SECRET = Prompt-Secret "MARKETPLACE_CLIENT_SECRET (Microsoft Marketplace client secret for OAuth token exchange)"
Set-Secret "MARKETPLACE_CLIENT_SECRET" $MARKETPLACE_CLIENT_SECRET

$MARKETPLACE_WEBHOOK_SECRET = Prompt-Secret "MARKETPLACE_WEBHOOK_SECRET (Marketplace webhook validation secret)"
Set-Secret "MARKETPLACE_WEBHOOK_SECRET" $MARKETPLACE_WEBHOOK_SECRET

$MARKETPLACE_METERING_CLIENT_SECRET = Prompt-Secret "MARKETPLACE_METERING_CLIENT_SECRET (Marketplace metering client secret for OAuth token exchange)"
Set-Secret "MARKETPLACE_METERING_CLIENT_SECRET" $MARKETPLACE_METERING_CLIENT_SECRET

Write-Host ""

# SECTION 5: Database
Write-Host "--- Database ---" -ForegroundColor $Blue
$STAGING_POSTGRES_ADMIN_PASSWORD = Prompt-Secret "STAGING_POSTGRES_ADMIN_PASSWORD (PostgreSQL admin password for staging)"
Set-Secret "STAGING_POSTGRES_ADMIN_PASSWORD" $STAGING_POSTGRES_ADMIN_PASSWORD

Write-Host ""

# Summary
Write-Host "=== Summary ===" -ForegroundColor $Blue
Write-Host "Secrets set: $($SecretsSet.Count)" -ForegroundColor $Green
foreach ($secret in $SecretsSet) {
    Write-Host "  ✓ $secret"
}

if ($SecretsFailed.Count -gt 0) {
    Write-Host "Secrets failed: $($SecretsFailed.Count)" -ForegroundColor $Yellow
    foreach ($secret in $SecretsFailed) {
        Write-Host "  ✗ $secret"
    }
    exit 1
}

Write-Host "✓ All secrets set successfully!" -ForegroundColor $Green
