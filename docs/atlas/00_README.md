# Atlas — wispr-flow-dashboard

## What Is This?

The `docs/atlas/` folder is a persistent context system — structured documentation
that helps engineers and LLM coding agents understand this codebase quickly.

## Files

| File | Purpose | Auto-generated? |
|------|---------|----------------|
| `00_README.md` | This file — how to use the atlas | No |
| `01_ARCHITECTURE.md` | System overview, data flow, design decisions | No |
| `02_DOMAIN_MODEL.md` | Core entities and vocabulary | No |
| `03_CRITICAL_FLOWS.md` | Happy-path call chains for top flows | No |
| `04_STATE_SOURCES_OF_TRUTH.md` | Where state lives + reconciliation rules | No |
| `05_EXTERNAL_DEPENDENCIES.md` | External systems/APIs | No |
| `06_GOTCHAS.md` | Known traps and fragile zones | No |
| `07_TEST_MATRIX.md` | Test structure + how to prove correctness | No |
| `08_CHANGELOG_LAST_14_DAYS.md` | Recent changes summary | Yes |
| `repo-map.md` | Directory tree, router table, entrypoints | Partially |

## How to Use

1. Start with `repo-map.md` to orient yourself
2. Read the domain-specific doc for your task area
3. Check `06_GOTCHAS.md` before modifying fragile areas
4. Only then dive into source files

## Maintenance

- Run `make atlas-generate` after structural changes
- Update manual docs when architecture, flows, or state management changes
- `make atlas-check` in CI to catch stale auto-generated files
