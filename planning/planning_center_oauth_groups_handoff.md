# Planning Center OAuth + Car Show Groups Handoff

## Goal

Use Planning Center as the identity provider for the car show staff tools, and use Planning Center Groups membership to grant app roles.

Target Planning Center groups:

- `carshow-admin`
- `carshow-registrar`
- `carshow-judge`
- Optional later: `carshow-photo-reviewer`

## Planning Center Setup

1. Create a private/internal Planning Center Groups group type, such as `Car Show Staff`.
2. Create the role groups listed above.
3. Add staff/judges to the appropriate groups.
4. Create one OAuth application in Planning Center developer tools.
5. Configure callback URLs:

```text
https://automationsolutions.ddns.net/carshow/api/auth/planning-center/callback
https://YOUR_PROD_DOMAIN/carshow/api/auth/planning-center/callback
```

## OAuth Scopes

Request:

```text
openid people groups
```

- `openid`: authenticate the Planning Center user.
- `people`: read current person/user identity.
- `groups`: read group membership.

Planning Center recommends OAuth/OIDC with a server-side confidential app and PKCE when possible.

## Required Headers

Planning Center API requests should include a User-Agent.

```bash
-H "Authorization: Bearer $PCO_ACCESS_TOKEN"
-H "User-Agent: Fathers Day Car Show (admin@yourchurch.org)"
```

## API Calls

### 1. Find Group IDs by Name

```bash
curl \
  -H "Authorization: Bearer $PCO_ACCESS_TOKEN" \
  -H "User-Agent: Fathers Day Car Show (admin@yourchurch.org)" \
  "https://api.planningcenteronline.com/groups/v2/groups?where[name]=carshow-admin"
```

Repeat for:

```text
carshow-admin
carshow-registrar
carshow-judge
```

Store the resolved group IDs in config/env if preferred, so auth does not depend on name lookups every login.

### 2. List Memberships for a Group

```bash
curl \
  -H "Authorization: Bearer $PCO_ACCESS_TOKEN" \
  -H "User-Agent: Fathers Day Car Show (admin@yourchurch.org)" \
  "https://api.planningcenteronline.com/groups/v2/groups/{group_id}/memberships?include=person&per_page=100"
```

This returns `Membership` records. Each membership has:

- `relationships.group`
- `relationships.person`
- `attributes.role`, usually `member` or `leader`
- optional included `Person` records when `include=person` is used

### 3. Check Current User Membership for One Group

If group IDs are known, this is a direct authorization check:

```bash
curl \
  -H "Authorization: Bearer $PCO_ACCESS_TOKEN" \
  -H "User-Agent: Fathers Day Car Show (admin@yourchurch.org)" \
  "https://api.planningcenteronline.com/groups/v2/groups/{group_id}/my_membership"
```

If a membership is returned, the current OAuth user belongs to that group. If it returns not found or unauthorized, treat that user as not in the group.

### 4. Get All Groups for a Person

After OAuth/OIDC login, use the Planning Center person id:

```bash
curl \
  -H "Authorization: Bearer $PCO_ACCESS_TOKEN" \
  -H "User-Agent: Fathers Day Car Show (admin@yourchurch.org)" \
  "https://api.planningcenteronline.com/groups/v2/people/{person_id}/groups?per_page=100"
```

Then match returned group names or IDs against the car show groups.

## Recommended App Auth Flow

1. User clicks `Login with Planning Center`.
2. API starts OAuth/OIDC flow and redirects to Planning Center.
3. Planning Center redirects back to:

```text
/carshow/api/auth/planning-center/callback
```

4. API exchanges the code for tokens.
5. API reads identity from `id_token`, `/oauth/userinfo`, or Planning Center current user endpoint.
6. API looks up group membership using one of the approaches above.
7. API creates or updates local `StaffUser`.
8. API issues the car show app session.

## Role Mapping

Recommended role mapping:

```ts
const GROUP_ROLE_MAP = {
  "carshow-admin": "ADMIN",
  "carshow-registrar": "REGISTRAR",
  "carshow-judge": "JUDGE",
} as const;
```

Role behavior:

- `ADMIN`: access to all admin controls and can be treated as a super-role.
- `REGISTRAR`: registration, check-in, QR assignment.
- `JUDGE`: judging app access.

If a person is in multiple groups, grant the union of permissions. If the existing app only supports one `StaffRole`, use priority:

```text
ADMIN > REGISTRAR > JUDGE
```

Longer term, consider changing the local model to support multiple roles per staff user.

## Permission Caveat

Planning Center API requests are made on behalf of the authenticated user. Their Planning Center permissions can affect whether group data is readable.

Early validation task:

1. Create a non-admin test user in `carshow-judge`.
2. OAuth login as that user.
3. Try:

```text
GET /groups/v2/people/{person_id}/groups
GET /groups/v2/groups/{judge_group_id}/my_membership
```

If the user can read their own memberships, pure OAuth is enough.

If not, use OAuth only for identity and perform membership lookup with a server-side Planning Center admin/service credential.

## Useful Docs

- Planning Center API overview: https://help.planningcenter.com/en/144877-the-planning-center-api.html
- Getting started: https://api.planningcenteronline.com/docs/overview/getting-started
- Authentication/OAuth/OIDC: https://api.planningcenteronline.com/docs/overview/authentication
- Groups API - Group: https://api.planningcenteronline.com/docs/apps/groups/versions/2023-07-10/vertices/group
- Groups API - Membership: https://api.planningcenteronline.com/docs/apps/groups/versions/2023-07-10/vertices/membership
- Groups API - Person: https://api.planningcenteronline.com/docs/apps/groups/versions/2023-07-10/vertices/person
