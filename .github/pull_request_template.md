## Summary

<!-- What does this change do, and why? One or two sentences are enough. -->

## Related issue

<!-- Closes #123, or "none". -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Build, CI or tooling

## How it was tested

<!-- Describe what you ran and what you checked by hand (for example "recorded a 30 s test in Chrome, replay matched"). -->

## Checklist

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] New logic in `packages/core` has tests
- [ ] User-visible changes are listed under `## [Unreleased]` in `CHANGELOG.md`
- [ ] Changes to the data contract (`packages/core/src/schema.ts`) bump `SCHEMA_VERSION` and explain the migration
- [ ] Nothing new is sent off the machine, and no personal or typing data is added to logs, fixtures or screenshots
- [ ] No keys, certificates, tokens or generated output (`dist/`, `release/`) are included
