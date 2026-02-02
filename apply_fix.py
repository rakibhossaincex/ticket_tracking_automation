import json

file_path = r'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\All Team Ticket log.json'
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

node = next(n for n in data['nodes'] if n['id'] == 'dae099ab-92d4-40c0-8405-73ccfd545f96')
js_code = node['parameters']['jsCode']

# 1. Update isCExGroup logic
import re
js_code = re.sub(r'const isCExGroup = CEX_GROUP\.some\(.*?\);', 'const isCExGroup = getTeamCode(currentTeamName) === "CEx";', js_code)

# 2. Improve teamsVisited detection
new_loop = """for (const p of parts) {
  const au = getAuthor(p);
  const body = stripHtml(p?.body || p?.comment || p?.note || "");
  const partType = norm(p?.part_type || p?.event_type || p?.type || "");
  const partCreatedAt = p.created_at || 0;
  
  if (norm(au.type) === "admin" && body) lastAdminNoteText = body;
  
  // Requirement 2: Detect team from ANY part if it has an assigned_to team
  const assignedTo = p.assigned_to || p.assignee || {};
  if (assignedTo.type === "team") {
    const teamId = String(assignedTo.id || "");
    const teamName = assignedTo.name || teamIdToName[teamId] || "";
    if (teamName) {
      teamsVisited.add(teamName);
    }
  }

  if (partType.includes("assign") || partType === "team_assignment" || 
      partType === "assignment" || partType === "assigned") {
    if (partCreatedAt > 0) {
      allAssignmentTimes.push(partCreatedAt);
    }
    if (assignedTo.type === "admin" && assignedTo.name) {
      lastAssignedAdmin = assignedTo.name;
    }
  }
}"""

# Pattern to find the parts loop. We look for the one that manages teamsVisited inside it usually.
pattern = r'for \(const p of parts\) \{[^}]*?lastAssignedAdmin[^}]*?\}'
js_code = re.sub(pattern, new_loop, js_code, flags=re.DOTALL)

node['parameters']['jsCode'] = js_code

with open(file_path, 'w', encoding='utf-8') as f:
    # Use indent=2 for a cleaner result without PowerShell's weird escaping
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Workflow updated successfully")
