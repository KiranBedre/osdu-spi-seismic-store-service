# ADR-043: Intact Upstream Passthrough Mode

## Status

Accepted

## Context

ADR-038 assumes a Java service repository with a shared core, cloud provider
modules, and cloud-specific test modules. Its filter removes non-Azure
providers and seeds the Azure provider and test trees as fork-owned source.

Some OSDU repositories do not have that ownership boundary. DDMS repositories,
DAG repositories, and libraries can mix shared and Azure-specific behavior
throughout one monorepo. Applying the ADR-038 filter would either halt on their
layout or require a configuration that claims ownership boundaries which do not
exist. Copying selected directories would also lose history and make later
upstream synchronization ambiguous.

ADR-039 already has a verbatim `mirror` mode, but that mode is for a different
tier. A customer mirror receives an already-finished SPI repository, including
its workflows, so it disables template synchronization. An intact source
repository still needs the template as an independent delivery channel for the
SPI engineering system.

## Decision

Add `SYNC_MODE=passthrough` for first-tier repositories that must preserve the
upstream tree intact.

Initialization selects the mode explicitly from the second line of the setup
issue response:

```text
https://community.opengroup.org/osdu/example
mode: passthrough
```

Passthrough initialization:

1. creates `fork_upstream` from the upstream tip's exact tree object;
2. preserves the upstream commit graph through the generated commit's parent;
3. fetches upstream tags into an isolated namespace and publishes them without
   rewriting them;
4. skips filter configuration generation and one-time Azure tree seeding;
5. applies the normal template resources on `fork_integration`; and
6. persists `SYNC_MODE=passthrough` before completing initialization.

Subsequent syncs reuse the existing generate-not-merge plumbing. The
`passthrough` generation revision is a stable sentinel because neither the
filter engine nor its configuration contributes to the tree. A repeated sync
against the same upstream tree is a no-op. The scheduled sync also publishes
new source tags from the isolated namespace; it never force-updates an existing
destination tag.

Passthrough has no path ownership split. Ownership assertions, Maven stamping,
core-only `fork_upstream` builds, and the filter report are disabled. Full-tree
build and image validation remain enabled. Unlike customer `mirror` mode,
template synchronization remains enabled because the source upstream does not
own the SPI workflows.

Unknown mode values halt rather than falling back to filtering.

## Consequences

### Positive

- DDMS, DAG, and library repositories can enter SPI without a risky initial
  source-code reorganization.
- Upstream history, tags, paths, and file bytes remain auditable.
- The same sync PR, cascade, duplicate-prevention, and release machinery serves
  filtered and intact repositories.
- SPI separation can be introduced later through ordinary reviewed changes.

### Negative

- The fork initially carries every upstream path, including provider or
  pipeline content that a filtered service would remove.
- Dependabot and code scanning cover the complete monorepo.
- Moving a repository from passthrough to a future ownership split requires an
  explicit migration decision; changing the variable alone is not sufficient.

## Related Decisions

- [ADR-006: Two-Workflow Initialization](006-two-workflow-initialization.md)
- [ADR-038: Upstream Filter Transform](038-upstream-filter-transform.md)
- [ADR-039: Customer-Tier Mirror Sync](039-customer-tier-mirror-sync.md)
