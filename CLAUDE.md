# wispr-flow-dashboard

Personal analytics dashboard for Wispr Flow voice dictation data. Reads from local SQLite DB, optionally fetches server stats via API, generates HTML dashboard or CLI output.

## Atlas — Persistent Context System

The `docs/atlas/` folder contains structured documentation for fast codebase onboarding.

### Agent Workflow

**Agent A (Plan + Execute)**:
1. Load `docs/atlas/repo-map.md` for orientation
2. Load the domain-specific atlas doc for your task
3. Read source files only after the atlas narrows your search
4. Implement changes following the patterns in the atlas

**Agent B (Verify)**:
1. Review diffs against `docs/atlas/06_GOTCHAS.md`
2. Verify changes match the flow described in `03_CRITICAL_FLOWS.md`
3. Confirm tests pass per `07_TEST_MATRIX.md`
4. Check state consistency against `04_STATE_SOURCES_OF_TRUTH.md`

### Working Rules
- **Analysis first**: Read the relevant atlas docs before writing code
- **Verify behavior**: After changes, confirm critical flows still work
- **No test-cheating**: Tests must pass because the code is correct
- **Update atlas**: If changes alter architecture/flows/state, update the relevant doc
- **Regenerate**: Run `make atlas-generate` after structural changes
