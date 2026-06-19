# Kubernetes deploy

Manifests for the Golf Training app + a Postgres database.

## Files
- `secret.example.yaml` — DB credentials + optional `ANTHROPIC_API_KEY` (copy to `secret.yaml`)
- `postgres.yaml` — Postgres `StatefulSet` + headless `Service` + 5Gi volume
- `deployment.yaml` — app `Deployment` (2 replicas, image from GHCR)
- `service.yaml` — app `ClusterIP` Service (port 80 → 8000)

## Apply

```bash
cp k8s/secret.example.yaml k8s/secret.yaml   # edit real values; do NOT commit
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

Pin the image to a tag instead of `latest`:

```bash
kubectl set image deployment/worktracker \
  worktracker=ghcr.io/tuergeist/worktracker:sha-<commit>
```

## Notes
- The app is stateless — scale `worktracker` freely; all data lives in Postgres.
- Images are built and pushed to `ghcr.io/<owner>/worktracker` by
  `.github/workflows/docker.yml` (tags: branch, `sha-<commit>`, semver, `latest`).
- Expose externally with your own `Ingress` (TLS) pointing at the `worktracker` Service.
- `kubectl rollout status deployment/worktracker` to watch a deploy.
```
