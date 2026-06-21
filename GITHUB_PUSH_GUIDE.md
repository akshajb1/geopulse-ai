# Pushing GeoPulse AI to GitHub 🚀

This guide explains how to initialize Git in the `geopulse-ai` repository, verify that files are correctly filtered by `.gitignore`, and push the complete project to GitHub.

---

## 🛠️ Step-by-Step Instructions

### Step 1: Initialize Git
Open your terminal (PowerShell, Command Prompt, or bash) in the project's root directory (`geopulse-ai`) and run:
```bash
git init
```

### Step 2: Verify `.gitignore`
Before adding files, make sure the `.gitignore` is working. This prevents large folders (like `node_modules` and Python `venv`) or secrets (like `.env`) from being tracked.

Run the following command to check what files Git wants to track:
```bash
git status
```
> **Note:** You should see `backend/`, `mobile/`, `schema.sql`, `README.md`, `GITHUB_PUSH_GUIDE.md`, and `.gitignore` listed as untracked, but you should **not** see `venv/`, `node_modules/`, or any `.env` files.

### Step 3: Stage and Commit the Code
Add all project files to Git:
```bash
git add .
```

Commit the staged files with an initial message:
```bash
git commit -m "Initial commit: GeoPulse AI complete codebase"
```

### Step 4: Rename the Default Branch to `main`
Ensure your default branch is named `main` (the modern standard):
```bash
git branch -M main
```

### Step 5: Create a Repository on GitHub

You can do this in one of two ways:

#### Option A: Via the GitHub Website (Recommended)
1. Go to [github.com](https://github.com/) and log in.
2. Click the **"+"** icon in the top-right corner and select **New repository**.
3. Name your repository `geopulse-ai`.
4. Leave it as **Public** or **Private** (do **not** check "Add a README file", "Add .gitignore", or "Choose a license" because we already have them locally).
5. Click **Create repository**.
6. Copy your repository's HTTPS URL (it will look like `https://github.com/YOUR_USERNAME/geopulse-ai.git`).

#### Option B: Via GitHub CLI (`gh`)
If you have the [GitHub CLI](https://cli.github.com/) installed and authenticated, you can create the repo directly from your terminal:
```bash
gh repo create geopulse-ai --public --source=. --remote=origin --push
```
*If you use Option B, you are done! The code is already pushed.*

### Step 6: Link Your Local Repository to GitHub
*(Only needed if you used Option A)*

Link your local repository to the remote GitHub repository by running (replace `YOUR_USERNAME` with your GitHub username):
```bash
git remote add origin https://github.com/YOUR_USERNAME/geopulse-ai.git
```

### Step 7: Push the Code to GitHub
*(Only needed if you used Option A)*

Push your code to the `main` branch of your new repository:
```bash
git push -u origin main
```

---

## 🔍 Troubleshooting

### 1. Large files warning or push timeout
If the push hangs, double-check that `node_modules/` or `venv/` was not accidentally tracked. You can check the files tracked in Git with:
```bash
git ls-files
```
If you see any environment or package files, untrack them using:
```bash
git rm -r --cached <folder_or_file_path>
git commit --amend --no-edit
```

### 2. Authentication errors
If you get a permission/authentication error during push:
- Verify that your GitHub username and credentials are correct.
- Consider setting up a **Personal Access Token (PAT)** or an **SSH Key** on GitHub if you are using HTTPS.
