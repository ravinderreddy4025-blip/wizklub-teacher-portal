# Publishing `@wizklub/design-tokens` to AWS CodeArtifact

Private npm package for WizKlub design tokens. Apps install it instead of copying `tokens.css` by hand.

## What gets published

| Import | File |
|---|---|
| `@wizklub/design-tokens/css` | `tokens/tokens.css` |
| `@wizklub/design-tokens/tailwind` | `tokens/tailwind.preset.js` |
| `@wizklub/design-tokens/json` | `tokens/tokens.json` |

---

## One-time AWS setup

You need a CodeArtifact **domain** and **repository**. Example names:

- Domain: `wizklub`
- Repository: `npm-packages`

### Option A — AWS Console

1. Open **CodeArtifact** in the same region as your other AWS resources (check `AWS_REGION` in `.env`).
2. **Create domain** → name `wizklub`.
3. **Create repository** → name `npm-packages`, upstream: none (or npmjs if you want public package proxy).
4. Note your **AWS account ID** (12 digits) from the console header or `aws sts get-caller-identity`.

### Option B — CLI

```bash
export AWS_REGION=ap-south-1          # your region
export CA_DOMAIN=wizklub
export CA_REPO=npm-packages
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws codeartifact create-domain --domain $CA_DOMAIN --region $AWS_REGION
aws codeartifact create-repository \
  --domain $CA_DOMAIN \
  --repository $CA_REPO \
  --region $AWS_REGION
```

### IAM permissions (publisher)

Whoever runs `npm publish` needs at least:

- `codeartifact:GetAuthorizationToken`
- `codeartifact:PublishPackageVersion`
- `codeartifact:ReadFromRepository`
- `sts:GetServiceBearerToken`

Attach the managed policy `AWSCodeArtifactAdminAccess` for admins, or a tighter custom policy for CI.

---

## Configure this package

1. **Set the registry URL** in `design-system/package.json` → `publishConfig.registry`:

   ```
   https://wizklub-123456789012.d.codeartifact.ap-south-1.amazonaws.com/npm/npm-packages/
   ```

   Pattern: `https://{domain}-{account}.d.codeartifact.{region}.amazonaws.com/npm/{repo}/`

2. **Create local `.npmrc`** (gitignored):

   ```bash
   cd design-system
   cp .npmrc.example .npmrc
   # Edit @wizklub:registry and always-auth lines with the same host/repo
   ```

3. **Fix AWS credentials** if `aws sts get-caller-identity` fails (your machine currently needs valid keys or SSO):

   ```bash
   aws configure
   # or: aws sso login --profile your-profile
   ```

4. **Log in to CodeArtifact** (valid 12 hours):

   ```bash
   aws codeartifact login \
     --tool npm \
     --domain wizklub \
     --domain-owner 123456789012 \
     --repository npm-packages \
     --region ap-south-1
   ```

---

## Publish

From `design-system/`:

```bash
npm run build          # regenerates tokens/ (also runs automatically on publish)
npm publish
```

Or use the helper script (PowerShell, from repo root):

```powershell
.\design-system\scripts\publish.ps1 -Domain wizklub -AccountId 123456789012 -Repository npm-packages -Region ap-south-1
```

First publish creates the package. Later publishes need a **version bump** in `package.json` (semver).

```bash
npm version patch   # 1.0.0 → 1.0.1
npm publish
```

---

## Install in an app

1. Add the same `@wizklub:registry=…` scope to the app’s `.npmrc` (or repo root `.npmrc`).
2. Run `aws codeartifact login …` on that machine (or use CI OIDC).
3. Install:

   ```bash
   npm install @wizklub/design-tokens
   ```

4. Use in code:

   ```js
   // Vite / React — in index.css or main entry
   import '@wizklub/design-tokens/css';

   // tailwind.config.js
   import wkPreset from '@wizklub/design-tokens/tailwind';
   export default { presets: [wkPreset], /* … */ };
   ```

---

## Token change workflow (after apps use the package)

1. Edit `frontend/wizklub-testimonials/src/styles/tokens.css` (source of truth).
2. Update value tables in `scripts/build_tokens.mjs` if adding new semantic tokens.
3. `npm run build` in `design-system/`.
4. `npm version patch && npm publish`.
5. In each app: `npm update @wizklub/design-tokens`.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Python was not found` | Use `node scripts/build_tokens.mjs` (not the Python script). |
| `ENEEDAUTH` / 401 on publish | Re-run `aws codeartifact login`. |
| `private` package | Remove `"private": true` from `package.json` (already removed). |
| `REPLACE_WITH_CODEARTIFACT_REGISTRY` | Set real URL in `publishConfig.registry`. |
| `IncompleteSignatureException` | Broken AWS credentials — reconfigure `aws configure` or SSO. |
| Version already exists | Bump version in `package.json` before publishing again. |
