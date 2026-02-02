import json

file_path = r'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\All Team Ticket log.json'
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Find Transform Ticket Data1 node
node = next(n for n in data['nodes'] if n['id'] == 'dae099ab-92d4-40c0-8405-73ccfd545f96')
js_code = node['parameters']['jsCode']

# 1. Update isCExGroup logic
old_cex_logic = 'const isCExGroup = CEX_GROUP.some(t => norm(currentTeamName).includes(norm(t).substring(0, 10)));'
new_cex_logic = 'const isCExGroup = getTeamCode(currentTeamName) === "CEx";'

if old_cex_logic in js_code:
    js_code = js_code.replace(old_cex_logic, new_cex_logic)
    print("Updated CEx logic")
else:
    print("Could not find CEx logic")

# 2. Improve teamsVisited detection
old_parts_loop = """for (const p of parts) {
  const au = getAuthor(p);
  const body = stripHtml(p?.body || p?.comment || p?.note || "");
  const partType = norm(p?.part_type || p?.event_type || p?.type || "");
  const partCreatedAt = p.created_at || 0;
  
  if (norm(au.type) === "admin" && body) lastAdminNoteText = body;
  
  if (partType.includes("assign") || partType === "team_assignment" || 
      partType === "assignment" || partType === "assigned") {
    const assignedTo = p.assigned_to || p.assignee || {};
    
    if (assignedTo.type === "team") {
      const teamId = String(assignedTo.id || "");
      const teamName = assignedTo.name || teamIdToName[teamId] || "";
      if (teamName) {
        teamsVisited.add(teamName);
      }
    }
    
    if (partCreatedAt > 0) {
      allAssignmentTimes.push(partCreatedAt);
    }
    if (assignedTo.type === "admin" && assignedTo.name) {
      lastAssignedAdmin = assignedTo.name;
    }
  }
}"""

new_parts_loop = """for (const p of parts) {
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

if old_parts_loop in js_code:
    js_code = js_code.replace(old_parts_loop, new_parts_loop)
    print("Updated parts loop")
else:
    # Try with \n escaped (how it likely is in the string inside JSON)
    # But json.load already unescaped it for us. 
    # Let's check if there are subtle whitespace differences.
    # I'll try a more robust search if direct match fails.
    print("Could not find parts loop - trying normalized match")
    import re
    # Simplify the replacement by targeting the specific IF block inside the loop
    old_inner = """    if (assignedTo.type === "team") {
      const teamId = String(assignedTo.id || "");
      const teamName = assignedTo.name || teamIdToName[teamId] || "";
      if (teamName) {
        teamsVisited.add(teamName);
      }
    }"""
    
    if old_inner in js_code:
        # We want to move this block outside the IF partType check
        # But we also need to define assignedTo earlier
        # This is getting complex. Let's just replace the whole loop content.
        
        # Let's see what the actual content looks like
        with open('debug_code.txt', 'w', encoding='utf-8') as f2:
            f2.write(js_code)
        print("Wrote js_code to debug_code.txt")

node['parameters']['jsCode'] = js_code
with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)
