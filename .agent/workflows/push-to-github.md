---
description: Push dashboard changes to GitHub
---

# Push Dashboard Changes to GitHub

Use this workflow after making changes to the dashboard files to sync them with GitHub.

## Steps

// turbo
1. Stage all changes:
```powershell
& "C:\Program Files\Git\bin\git.exe" add -A
```

// turbo
2. Commit with a descriptive message:
```powershell
& "C:\Program Files\Git\bin\git.exe" commit -m "YOUR_COMMIT_MESSAGE_HERE"
```

3. Push to GitHub:
```powershell
& "C:\Program Files\Git\bin\git.exe" push origin main
```

## Notes
- Working directory: `c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\dashboard`
- GitHub repo: https://github.com/rakibhossaincex/ticket_tracking_automation
- Live site: https://rakibhossaincex.github.io/ticket_tracking_automation/
- Changes may take 1-2 minutes to appear on the live site after pushing
