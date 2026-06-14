# Repository Agent Instructions

## Deployments

Deployments are handled exclusively via GitHub Actions — do not run `infra/deploy.sh` or Terraform locally, and do not ask the user to do so.

To ship a change:
1. Commit work to a feature branch.
2. Open a pull request against `main`.
3. GitHub Actions handles build, test, and deploy on merge.

Always test on localhost before opening a PR. Never expose or commit AWS keys, secrets, tfvars, state files, or `.env` values.
