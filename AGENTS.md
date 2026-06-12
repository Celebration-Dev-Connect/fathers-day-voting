# Repository Agent Instructions

## AWS Deployments

Read `infra/DEPLOYMENT_RUNBOOK.md` before every AWS deployment.

Important:

- The existing deploy identity is the key/secret-only IAM user
  `carshow-deploy-caleb`. It has no console password and does not use SSO.
- `infra/deploy.sh` automatically sources the repository's ignored `.env` file
  and maps `AWS_SECRET` to `AWS_SECRET_ACCESS_KEY`.
- Do not ask the user to configure SSO or re-enter credentials when the deploy
  script successfully reports authentication as `carshow-deploy-caleb`.
- Always pass `--auto-approve` for requested non-interactive deployments.
- Routine application deployments currently use `--skip-infra` because full
  Terraform plans still lack some read permissions and can include unsafe
  secret/config drift.
- `--skip-infra` pushes the API image and deploys all SPAs, but does not update
  the ECS service. If API code changed, follow the ECS promotion procedure in
  the runbook.
- Never enable `CLEANUP_REGISTRATIONS_ON_START` or
  `RANDOMIZE_OWNER_CODES_ON_START` unless the user explicitly requests that
  one-time operation.
- Production must always have `RUN_SEED=false`.

