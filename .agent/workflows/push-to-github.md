---
description: Push dashboard changes to GitHub
---

# Push Dashboard Changes to GitHub

// turbo-all

Use this workflow after making changes to dashboard files to sync them with GitHub.

**Repo:** https://github.com/rakibhossaincex/ticket_tracking_automation
**Live site:** https://rakibhossaincex.github.io/ticket_tracking_automation/
**Working directory (repo root):** `C:\Users\MD. Rakib Hossain\.gemini\antigravity\scratch\pstf_automation`

---

## Steps

1. Check what has changed:
```powershell
git -C "C:\Users\MD. Rakib Hossain\.gemini\antigravity\scratch\pstf_automation" status
```

2. Stage the dashboard files that were modified. For dashboard-only changes:
```powershell
git -C "C:\Users\MD. Rakib Hossain\.gemini\antigravity\scratch\pstf_automation" add dashboard/index.html dashboard/styles.css dashboard/app.js
```
If other files were also changed and should be included, use `git add -A` instead.

3. Commit with a descriptive message derived from what was changed (do NOT use a placeholder — generate a real message based on the actual changes made):
```powershell
git -C "C:\Users\MD. Rakib Hossain\.gemini\antigravity\scratch\pstf_automation" commit -m "COMMIT_MESSAGE"
```
Replace `COMMIT_MESSAGE` with a concise summary of what was changed, e.g.:
- `"Add product type filter to dashboard"`
- `"Fix SLA percentage calculation for CEx team"`
- `"Update team SLA chart unit toggle to include minutes"`

4. Push to GitHub:
```powershell
git -C "C:\Users\MD. Rakib Hossain\.gemini\antigravity\scratch\pstf_automation" push origin main
```

5. Confirm the push succeeded:
```powershell
git -C "C:\Users\MD. Rakib Hossain\.gemini\antigravity\scratch\pstf_automation" log --oneline -3
```

---

## Notes
- Changes appear on the live site within ~1–2 minutes of a successful push.
- If push fails with auth error, the user needs to re-authenticate: run `git credential-manager erase` then try again.
- Never force-push (`--force`) unless the user explicitly requests it.
