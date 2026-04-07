# Pushing code to AWS

“Commit to AWS” usually means **pushing a Git repository** to **AWS CodeCommit**, then (optionally) **deploying** from there to EC2, ECS, CodePipeline, etc.

Your project already has a **local Git repo** and an **initial commit** (if you ran setup from this guide). **`.env` is gitignored** — never push real secrets.

## Option A — AWS CodeCommit (Git on AWS)

### 1. Create the repository

1. AWS Console → **CodeCommit** → **Create repository** (e.g. `parent-orientation-tracker`).
2. Note the **clone URL** (HTTPS or SSH).

### 2. Credentials

- **HTTPS:** create **HTTPS Git credentials** for your IAM user (IAM → User → Security credentials → HTTPS Git credentials for CodeCommit), or use the **AWS CLI credential helper** (recommended on dev machines):

  ```bash
  git config --global credential.helper '!aws codecommit credential-helper $@'
  git config --global credential.UseHttpPath true
  ```

  Requires AWS CLI v2 configured (`aws configure` with access key or SSO).

- **SSH:** upload an SSH public key to IAM and use the SSH clone URL.

### 3. Add remote and push

From the project root (`Parent_Orientation_Tracker`):

```bash
git remote add origin https://git-codecommit.<region>.amazonaws.com/v1/repos/parent-orientation-tracker
git branch -M main
git push -u origin main
```

Replace `<region>` and the repo name with yours.

### 4. Set your real Git identity (optional but recommended)

```bash
git config user.name "Your Name"
git config user.email "your.email@company.com"
```

(Or use `--global` once per machine.)

---

## Option B — GitHub / GitLab + deploy to AWS

Many teams host Git on **GitHub** and deploy to AWS with **CodePipeline**, **Elastic Beanstalk**, **ECS**, or a simple **EC2** pull + `docker compose` / systemd.

1. Create an empty repo on GitHub.
2. `git remote add origin https://github.com/ORG/parent-orientation-tracker.git`
3. `git push -u origin main`
4. On the server: clone, `.env` from `.env.production.example`, `npm ci`, systemd/Docker as in **`DEPLOYMENT.md`**.

---

## After the code is on AWS

- **Run the app** on **EC2**, **ECS**, **Elastic Beanstalk**, or **Lightsail** using **`deploy/DEPLOYMENT.md`** or **`deploy/docker.md`**.
- Store **`MONGODB_URI`**, **`COOKIE_SECRET`**, and passwords in **AWS Secrets Manager** or **SSM Parameter Store**, not in Git.

---

## Quick check before any push

```bash
git status
git check-ignore -v .env   # should show .gitignore rule
```

If `.env` appears in `git status`, **do not push** until it is ignored or removed from the index.
