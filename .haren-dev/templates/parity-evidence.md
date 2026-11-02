---
unit: {SCR_A001}
difference: {one line about the difference}
verdict: {matches-legacy | target-bug | approved-deviation}
---

# Parity Evidence: {SCR_A001}

## Environment
The user, tenant and locale must be equal on both sides.

| Side | User | Tenant | Locale |
|------|------|--------|--------|
| Legacy | {user} | {tenant} | {locale} |
| Target | {user} | {tenant} | {locale} |

## Steps
1. {step}

## Legacy result
{What the legacy system showed.}

## Target result
{What the target system showed.}

## Evidence
- Screenshots: {paths}
- Network: {request and response}
- SQL: {query and rows, for example from ORDER_TBL}

## Verdict
{matches-legacy | target-bug | approved-deviation}. {If approved-deviation, give the DEV-ID.}
