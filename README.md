# Factory

A small, real, end-to-end demo of an **AI-native software factory**: a change
starts as a GitHub issue/PR, moves through spec → task → build → validate →
review → merge, deploys itself to Azure via GitHub Actions, and is watched in
production by **Azure SRE Agent**.

```
GitHub (intake → spec → task → build → validate → review → merge)
        │  git push / PR merge
        ▼
GitHub Actions (CI: test + lint + bicep validate  |  CD: build, push, deploy)
        │  OIDC federated login (no stored secrets)
        ▼
Azure Container Apps (gh-factory-web, gh-factory-api)  +  ACR + Log Analytics + App Insights
        │  telemetry / alerts
        ▼
Azure SRE Agent (auto-investigates alerts, proposes/executes remediation)
```

## What's here

| Path                        | Purpose                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| `apps/web`                   | Vite + React + TypeScript shopping-cart storefront (Nginx in prod)  |
| `apps/api`                   | Express product/cart API, `/healthz`, and a `/api/chaos/error` route for SRE demos |
| `infra/main.bicep`           | ACR, Log Analytics, App Insights, Container Apps environment + apps |
| `.github/workflows/ci.yml`   | Lint, unit test, bicep validate on every PR                          |
| `.github/workflows/cd.yml`   | OIDC login → deploy infra → build/push images → roll out new revision |
| `sre-agent/`                 | Config for the Azure SRE Agent watching this app (see below)          |

## Run it locally

```powershell
docker compose up --build
# web:  http://localhost:5173
# api:  http://localhost:8080/healthz
```

## The factory loop, mapped to this repo

- **Intake / Spec / Task** — a GitHub issue is refined by a coding agent into a
  bounded task ("Ready to Implement").
- **Build** — the agent implements the change and opens a PR; `ci.yml` runs
  unit tests, lint, and `az bicep build` to validate infra changes.
- **Validate / Review** — CI status + human/agent code review gate the merge.
- **Merge** — merging to `main` triggers `cd.yml`.
- **Learn** — Azure SRE Agent watches Azure Monitor alerts on the deployed
  app, auto-investigates incidents, and that learning feeds back into the
  next Intake.

## Deploying the CD pipeline (one-time setup)

1. Create a Microsoft Entra app registration + federated credential trusting
   `repo:<org>/gh-factory:ref:refs/heads/main` (see `infra/setup-oidc.ps1`).
2. Grant that app **Contributor** on the target resource group.
3. Add repo secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_OBJECT_ID`.
4. Push to `main` — `cd.yml` creates the resource group, ACR, Container Apps
   environment, and the two apps, then rolls out real container images.

## Azure SRE Agent

`sre-agent/README.md` documents how the Azure SRE Agent is deployed against
this resource group (Log Analytics + Application Insights + Azure Monitor
alert rules), using the `azmon-lawappinsights` recipe from
[microsoft/sre-agent](https://github.com/microsoft/sre-agent). Hit
`GET /api/chaos/error` a few times on the deployed API to trigger the demo
alert and watch the agent investigate.
