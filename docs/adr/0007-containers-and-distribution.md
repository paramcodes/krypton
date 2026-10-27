# 0007 — Containers and distribution

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

Development happens on Linux with rootless Podman. CI runs on GitHub-hosted
runners with Docker. Self-hosters may use either runtime, or a managed container
platform. The compose file and image must not assume one vendor's extensions.

## Decision

- **Local development:** Podman 6.1.4, rootless. Use `podman compose` through the
  installed Docker Compose provider (verified with Docker Compose 5.6.1).
- **CI:** Docker on GitHub Actions.
- **Distribution:** one OCI image and a provider-neutral `compose.yaml`.
- **Database:** Postgres, pinned to a supported major in the compose file. Target
  Postgres 17 or newer unless a dependency forces otherwise.
- **Runtime user:** non-root. Volumes and configuration are documented, including
  rootless ownership.
- **No Docker-specific features** in the compose file or application code. Use
  standard health checks, named volumes, and environment variables.

## Alternatives considered

- **Docker locally** — the most common path, but Docker is not installed on the
  development machine and rootless Podman is the chosen local runtime.
- **Kubernetes** — powerful, but too heavy for the single-instance v1 audience.
- **SQLite only** — simpler to ship, but weaker for concurrent workers, leases,
  and durable run history.
- **A hosted database** — convenient, but conflicts with the self-hosted default.

## Consequences

- Every container change is tested with Podman locally and Docker in CI.
- Rootless networking and volume ownership need explicit documentation; do not
  hide them behind `sudo`.
- The image build belongs to Stage 8/9. Stage 0 only records the contract.
- A compose file that works on one runtime but not the other is a bug.

## Evidence

- `podman info` reports rootless mode.
- `podman compose version` works with Docker Compose 5.6.1.
- No Docker installation is present locally.

## Revisit when

- Podman compose breaks on a supported platform.
- Self-hosters need a Kubernetes manifest as a first-class target.
- Postgres 17+ is no longer the right baseline.
