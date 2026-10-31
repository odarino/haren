---
project: {project name}
date: {date}
---

# Architecture Overview

System-level decisions that apply across all modules.

## Deployment Model

**Chosen:** {monolith / modular monolith / microservices / serverless}
**Rationale:** {why this was chosen}

## Communication Patterns

**Between modules:** {REST / gRPC / event bus / in-process / message queue}
**Rationale:** {why}

## Shared Infrastructure

| Resource | Shared or Per-Module | Detail |
|----------|---------------------|--------|
| Database | {shared / per-module} | {e.g., PostgreSQL shared instance} |
| Auth/Identity | {shared / per-module} | {e.g., shared JWT issuer} |
| Cache | {shared / per-module} | {e.g., shared Redis} |
| Logging | {shared} | {e.g., structured JSON to stdout} |

## Repo Structure

**Chosen:** {monorepo / multi-repo}
**Repos:** {list repos and what lives in each}

## Deployment Topology

**Target:** {containers / serverless / PaaS / bare metal}
**Provider:** {AWS / GCP / Azure / self-hosted / TBD}
**Orchestration:** {Kubernetes / Docker Compose / none / TBD}

## Cross-Cutting Concerns

| Concern | Decision | Detail |
|---------|----------|--------|
| Error handling | {pattern} | {e.g., structured error codes} |
| Configuration | {pattern} | {e.g., env vars + config file} |
| Testing strategy | {pattern} | {e.g., unit + integration per module} |
| CI/CD | {pattern} | {e.g., GitHub Actions} |

## Key Constraints

- {constraint that affects all modules}
