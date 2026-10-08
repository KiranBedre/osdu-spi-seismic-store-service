# Docker Build Action

Builds a service container image from a Maven JAR, a prebuilt Node runtime, or
another complete runtime artifact, and optionally pushes it to GHCR with
SHA/branch tags and a public-visibility flip.

## Purpose

For `build_kind: maven-jar`, this action consumes the `build-artifacts`
artifact from [`java-build`](../java-build) and uses the template-owned
`build/Dockerfile`. For `build_kind: source`, it restores the prebuilt Node
runtime into the checked-in context declared by a schema v4 service descriptor.
For `build_kind: artifact`, it uses the downloaded artifact as the complete
build context and pairs it with a checked-in Dockerfile. It does not run a
language build. A single `push` input selects between registry modes so one
action can back both jobs in `validate.yml` (W5a):

- `push: 'false'` — build only. Validates that the Dockerfile compiles. **No GHCR login happens**, and the built image is kept only in the BuildKit/buildx cache (it is not pushed, nor loaded into the runner's Docker image store).
- `push: 'true'` — build, log in to GHCR, push, compute branch tags, and flip the package public.

> **`push` defaults to `'true'`.** The caller must set `push: 'false'` explicitly on the validate-only `docker-build` job; otherwise it will attempt a credentialed push.

## How It Fits

```
java-build (uploads build-artifacts) -> docker-build (this action)
node-build (validates checked-in source) -> docker-build (this action)
other build (uploads a complete runtime) -> docker-build (this action)
```

`validate.yml` (W5a) calls this action as two jobs:

| Job | `push` | Permissions | Trust boundary |
|-----|--------|-------------|----------------|
| `Docker Build` | `'false'` | `contents: read` | Runs on every event, including external-fork PRs; the same job validates the test-suite image |
| `Docker Push` | `'true'` | `packages: write` | Gated by the §5.5 `if:` clause (no `pull_request_target`, external-fork, or `dependabot[bot]`) — the gate lives on the **job**, not in this action |

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `image_name` | **Yes** | — | Short service name (e.g. `partition`); set from `vars.SERVICE_NAME` |
| `dockerfile_path` | No | `build/Dockerfile` | Dockerfile path relative to the repo root. Defaults to the canonical Dockerfile the engineering system syncs to every fork (ADR-037) |
| `build_context` | No | `.` | Docker build context directory |
| `build_kind` | No | `maven-jar` | `maven-jar` resolves a JAR, `source` restores a Node runtime into the checked-in context, and `artifact` uses the downloaded runtime artifact as the complete context |
| `registry` | No | `ghcr.io` | Container registry host |
| `org` | No | _(repo owner)_ | Registry org/owner; falls back to the workflow `github.repository_owner` at runtime when omitted |
| `jar_artifact_name` | No | `build-artifacts` | Name of the artifact containing the built JARs |
| `source_artifact_name` | No | `node-runtime-artifacts` | Name of the prebuilt Node runtime (`source`) or complete runtime context (`artifact`) |
| `jar_file` | No | — | Conventional path/glob of the service Spring Boot JAR (`validate.yml` passes `provider/<SERVICE_NAME>-azure/target/*-spring-boot.jar`, from `SERVICE_TARGET_JAR` or `SERVICE_NAME`). If it matches no file the action auto-discovers the Azure JAR (deviant modules like `entitlements-v2-azure`); `SERVICE_TARGET_JAR` only disambiguates a service that builds more than one |
| `build_args` | No | — | Optional extra `--build-arg` values (newline-separated `KEY=VALUE`). The JAR is passed via `jar_file` (resolved), not here. **Never pass `GITHUB_TOKEN` here.** |
| `push` | No | `'true'` | `'true'` logs in, pushes, tags, and flips visibility; `'false'` builds only |
| `github_token` | No | — | Token for GHCR login + visibility flip. Consumed only on the push path |

## Outputs

| Output | Description |
|--------|-------------|
| `image_repository` | Full registry path, e.g. `ghcr.io/<org>/<service>` (always set) |
| `image_digest` | `sha256:…` digest of the pushed image (prefix already included). **Empty string when `push != 'true'`** |
| `image_tags` | Comma-separated tags (log use only) — deploy stages must use `image_digest`, not a tag |

## Tagging Strategy

| Tag | When |
|-----|------|
| `:sha-<short-sha>` | Always (12-char SHA; immutable, browsable) |
| `:<branch>-snapshot` | `push: 'true'` on a protected branch (`main`, `fork_integration`, `fork_upstream`) |
| `:<version>` | Applied by `release.yml` (W7), **never** by this action |

## Security Model

- `push: 'false'` skips the GHCR login step entirely — the `GITHUB_TOKEN` is never used for registry auth in build-only mode, and the visibility flip is skipped.
- The build step never receives `GITHUB_TOKEN` as a `--build-arg` or env var; the token reaches only the login and visibility-flip steps.
- The selected context and Dockerfile are validated as repository-relative
  paths and copied to a fixed runner-temporary path. Workflow-controlled paths
  never reach the Buildx action directly.
- The visibility flip is idempotent (skips when already public) and **soft-fail** — a permission error logs a warning with a `gh workflow run settings-apply.yml` remediation hint but never fails the build.
- The trust boundary (ADR-036) lives on the `docker-push` **job** in `validate.yml`, not in this action.

## Platforms

The `push: 'true'` (release) path builds multi-arch for `linux/amd64` and
`linux/arm64`; the `arm64` leg is emulated via QEMU on the amd64 runner. The
`push: 'false'` (validate-only) path builds `linux/amd64` only and skips QEMU
entirely, avoiding emulation overhead on every PR.

`provenance: false` keeps the pushed manifest a clean two-platform index (no `unknown/unknown` attestation entry), so a bare `docker pull` resolves natively on Apple Silicon and amd64 alike — without it, a single-arch build still publishes as an index and `docker pull` fails to match on arm64.

## Digest Usage

Deploy references are composed as `${image_repository}@${image_digest}`. The digest already includes the `sha256:` prefix — **do not** prepend it again, or the reference becomes `@sha256:sha256:…` and the kubelet fails to pull.

## Scripts

| Script | Role |
|--------|------|
| `compute-metadata.sh` | Lowercases `registry/org/image_name`; emits `short_sha` |
| `compute-tags.sh` | Emits `image_tags` (comma) + `docker_tags` (newline, for build-push) |
| `resolve-jar.sh` | Resolves the service JAR: honours the conventional/override path, else auto-discovers the Azure Spring Boot JAR (deviant modules) |
| `set-package-visibility.sh` | Org/user-aware, idempotent, soft-fail GHCR public flip |

## Local Testing

Each script writes to `$GITHUB_OUTPUT` when set and echoes `key=value` to stdout, so it runs standalone:

```bash
GITHUB_SHA=abc123def4567 GITHUB_OUTPUT=/dev/stdout \
  ./compute-metadata.sh ghcr.io my-org partition

GITHUB_OUTPUT=/dev/stdout \
  ./compute-tags.sh ghcr.io/my-org/partition abc123def456 main true

GITHUB_TOKEN=*** ./set-package-visibility.sh my-org partition
```

The full action needs a service build context or Maven artifact. End-to-end
runtime proof happens on a downstream service fork.

## Related

- ADR-010 (YAML-safe shell scripting), ADR-013 (reusable actions), ADR-028 (script extraction), ADR-033 (GHCR registry), ADR-036 (workflow trust boundaries), ADR-037 (canonical service Dockerfile)
