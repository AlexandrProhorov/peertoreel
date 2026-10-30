# ADR-0002: SeaweedFS instead of MinIO for local S3

- **Дата:** 2026-10-30
- **Статус:** accepted

## Контекст

`AGENTS.md` предполагает MinIO локально. В 2026 году MinIO архивировал community edition и
удалил образы из Docker Hub; `quay.io/minio/minio` требует авторизации. Локальная
инфраструктура должна подниматься одной командой без приватного registry.

## Решение

- Локально используем **SeaweedFS** с S3 API на `http://localhost:8333`.
- Bucket `kadence` создаётся init-контейнером `amazon/aws-cli`.
- Production остаётся на **Cloudflare R2**.
- Приложение работает только через S3 API, без MinIO-специфичных вызовов.

## Последствия

- `AGENTS.md` нужно обновить: MinIO → SeaweedFS (local only).
- Нужно проверить совместимость presigned URL и multipart upload с SeaweedFS в M1.
- Если SeaweedFS окажется несовместим с нужным сценарием, альтернативы: RustFS или LocalStack.
