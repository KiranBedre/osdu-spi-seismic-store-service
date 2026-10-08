# ADR-044: Node and TypeScript Service Archetype

## Status

Accepted

## Context

The template's original build and acceptance paths assume a Java/Maven service:
Maven produces an Azure JAR, the canonical Dockerfile copies that artifact, and
the acceptance image invokes Maven against Surefire or Failsafe reports.

Seismic Store Service V3 and other DDMS repositories are Node/TypeScript
monorepos. Their service image is built from a checked-in source Dockerfile,
their quality commands are npm scripts, and their acceptance entrypoint can be
a checked-in shell script or executable rather than a Maven module. Treating
those repositories as exceptional workflow branches would duplicate the
trusted build and deploy lanes and make their evidence weaker than Java
services.

## Decision

Add `node-typescript-azure` as a first-class service archetype while preserving
the Java contract.

Schema version 3 remains Java/Maven-only. Schema version 4 adds explicit service
metadata:

- `service.archetype`;
- repository-relative `sourcePath`;
- the Node major in `nodeVersion`; and
- source image `context` and `dockerfile`.

The reusable Node build action validates those values, requires an npm lockfile,
and runs `npm ci` plus configured lint, build, and test npm script names. It fails
unless JUnit proves that at least one test executed with no failures or errors,
and LCOV evidence exists when coverage is required. Workflow detection uses the
descriptor first and retains Maven detection as the compatibility fallback.

The Docker build action has two explicit kinds. `maven-jar` resolves and copies
the built artifact as before. `source` builds the declared context and
Dockerfile without attempting Maven artifact discovery.

Schema version 4 also adds `script` acceptance suites. Each suite declares a
repository-relative executable, argv tokens, and JUnit report globs. The
acceptance image installs locked npm dependencies and invokes the executable
directly. It performs environment substitution only when an entire argv token
is exactly `${NAME}`. It never evaluates a shell command string. The verdict
uses the declared JUnit globs and applies the same nonzero-exit, no-failures,
and tests-executed rules as Maven suites.

All suites in one acceptance image must use one runtime type. The initial
script image is pinned to Node 22; a different declared Node major halts image
resolution instead of silently running tests on the wrong runtime.

## Consequences

### Positive

- Node/TypeScript DDMS repositories use the same trusted CI, image, release,
  borrow/prove/restore, and evidence paths as Java services.
- Existing schema v3 descriptors and descriptor-less Maven repositories keep
  their behavior.
- Repository paths, npm script names, executables, and argument expansion are
  validated without introducing shell evaluation.
- Test success is based on machine-readable evidence, not console text or a
  zero process exit alone.

### Negative

- The template now maintains two build runtimes and two acceptance image
  implementations.
- Supporting another script-suite Node major requires adding a pinned runtime
  image and extending the explicit compatibility contract.
- Node repositories must adapt their test commands to emit JUnit and LCOV
  evidence at stable paths.

## Related Decisions

- [ADR-025: Java/Maven Build Architecture](025-java-maven-build-architecture.md)
- [ADR-037: Engineering System Owns the Canonical Service Dockerfile](037-engineering-system-owns-service-dockerfile.md)
- [ADR-040: Descriptor-Owned Acceptance Contract](040-descriptor-acceptance-contract.md)
- [ADR-041: Borrow, Prove, Restore Lane](041-borrow-prove-restore-lane.md)
