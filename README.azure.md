# Deploying SecureBank to Azure — Phase 3 (Fortify)

Files in this bundle, and where they go in your repo:

```
securebank/
├── backend/
│   ├── Dockerfile              <- add
│   └── .dockerignore           <- add
├── frontend/
│   ├── Dockerfile              <- add
│   ├── nginx.conf              <- add
│   └── .dockerignore           <- add
├── infra/
│   └── main.bicep              <- add (new folder)
└── .github/workflows/
    └── cd-azure.yml            <- add alongside your existing ci.yml
```

## 1. One-time setup (do this once, manually, before the pipeline can run)

```bash
az login
az group create -n securebank-rg -l eastus

# Grant GitHub Actions an OIDC federated identity (no long-lived secrets in GitHub)
az ad app create --display-name securebank-gh-oidc
# ...then federated-credential add scoped to repo:<org>/<repo>:ref:refs/heads/main
# Full steps: https://learn.microsoft.com/azure/developer/github/connect-from-azure

az deployment group create -g securebank-rg -f infra/main.bicep \
  -p namePrefix=securebank-dt6 dbAdminPassword=<strong-pw> jwtSecret=<random-64-char>
```

Store `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` as GitHub **secrets**, and
`ACR_NAME`, `RESOURCE_GROUP`, `BACKEND_APP_NAME`, `FRONTEND_APP_NAME`, `CAE_NAME` as GitHub
**variables** (Settings → Environments → production). After that, every push to `main` builds,
scans, and deploys automatically.

## 2. The one real code change required: swap SQLite for Postgres

`better-sqlite3` writes to a local file. Container Apps' filesystem is ephemeral and instances
scale horizontally, so a local file means every replica sees a different, resettable database —
this alone would fail "Scalability, Availability & Reliability" and "Service Deployment &
Environment Consistency." `infra/main.bicep` already provisions an **Azure Database for
PostgreSQL Flexible Server** and injects `DATABASE_URL` as a Key Vault–backed secret.

You have two paths:
- **Swap the data layer** (recommended, matches what `ARCHITECTURE.md` already says was the
  Phase 1 plan): replace `backend/db.js` with `pg` or an ORM (Prisma/Drizzle), translate the
  `CREATE TABLE IF NOT EXISTS` block to Postgres syntax. I can do this conversion for you if
  you want — it's a contained, mechanical change since every query already goes through `db.js`.
- **Keep SQLite, mount a volume**: only defensible if you pin `minReplicas: 1` (no horizontal
  scale) and mount an Azure Files share into the container. Weaker story for the "Scalability"
  line item, so I wouldn't lead with this in front of judges.

## 3. How this maps to the rubric

| Criterion | What covers it |
|---|---|
| Service Deployment & Environment Consistency (15%) | Both services are containerized (identical image runs local/CI/prod); `docker-compose.yml` locally, same images in Container Apps |
| Build & Release Automation (20%) | `cd-azure.yml`: lint → test → secret-scan → image build → vuln scan → push → revision-based deploy → smoke test, all gated, all on push to `main` |
| Automated Infrastructure & Configuration Management (15%) | `infra/main.bicep` — every Azure resource (ACR, Postgres, Key Vault, Log Analytics, Container Apps) is declared and re-deployable, not clicked together in the portal |
| Scalability, Availability & Reliability (10%) | Container Apps HTTP-based autoscale rule (1→5 replicas backend), liveness/readiness probes, zero-downtime revisions |
| Operational Visibility & System Health (15%) | Log Analytics workspace + Application Insights wired to both apps; `/api/health` and `/healthz` probes; `APPLICATIONINSIGHTS_CONNECTION_STRING` injected for request/dependency tracing |
| Security Practices & Protection of Sensitive Data (15%) | No secrets in code or CI vars: JWT secret + DB connection string live in Key Vault, apps read them via **system-assigned managed identity** (no stored credentials anywhere); OIDC federated login for GitHub→Azure (no client secret); Gitleaks + Trivy gates in the pipeline; `helmet()` + rate limiting already in `app.js` |
| Engineering Best Practices (5%) | Multi-stage, non-root Dockerfiles; `.dockerignore` keeps `.env`/`.db` files out of images; existing `ci.yml` lint/test suite reused as a gate before any deploy |

## 4. Things to double-check before judging

- `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` in `app.js` currently default to `localhost` — set these
  as env vars on the backend Container App to your real frontend FQDN, or WebAuthn (biometric
  login) will fail in production.
- CORS: `cors()` with no options allows all origins. Lock it to the frontend's Container App
  FQDN once you know it (`cors({ origin: process.env.FRONTEND_ORIGIN })`).
- Rotate `dbAdminPassword` / `jwtSecret` out of your shell history once deployed — they should
  only ever live in Key Vault after the initial `az deployment group create`.
