$path = 'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\All Team Ticket log.json'
$json = Get-Content $path -Raw | ConvertFrom-Json

# Find node
$node = $json.nodes | Where-Object { $_.id -eq 'dae099ab-92d4-40c0-8405-73ccfd545f96' }
$code = $node.parameters.jsCode

# 1. Update isCExGroup logic
# Normalize the search string to handle possible whitespace/quote differences
$code = $code -replace 'const isCExGroup = CEX_GROUP\.some\(.*?\);', 'const isCExGroup = getTeamCode(currentTeamName) === "CEx";'

# 2. Improve teamsVisited detection
$newLoop = 'for (const p of parts) {
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
}'

# Replace the specific loop in the jsCode. We look for a loop that contains "lastAssignedAdmin" to be sure it is the right one.
$pattern = 'for \(const p of parts\) \{[^}]*?lastAssignedAdmin[^}]*?\}'
$code = [regex]::Replace($code, $pattern, $newLoop, [System.Text.RegularExpressions.RegexOptions]::Singleline)

$node.parameters.jsCode = $code
$json | ConvertTo-Json -Depth 100 | Set-Content $path
