import json
import os

file_path = r'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\All Team Ticket log.json'
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# The node id for Transform Ticket Data1 is dae099ab-92d4-40c0-8405-73ccfd545f96
node = next(n for n in data['nodes'] if n['id'] == 'dae099ab-92d4-40c0-8405-73ccfd545f96')
js_code = node['parameters']['jsCode']

# Find and replace the SLA calculation block
old_sla_block = """// NEW SLA CALCULATION LOGIC
let slaStatus = "";
let slaLimitHours = null;
const uniqueTeamsCount = teamsVisited.size;

// Check for PSTF -> CEx Reversal exception
const isPSTFtoCExReversal = (
  uniqueTeamsCount === 2 &&
  teamsVisited.has("Pro Solutions Task Force") &&
  teamsVisited.has("CEx Reversal")
);

let slaApplicable = false;

if (uniqueTeamsCount <= 1) {
  slaApplicable = true;
} else if (isPSTFtoCExReversal) {
  slaApplicable = true;
} else {
  slaApplicable = false;
  slaStatus = "N/A";
}

if (slaApplicable && agentHandleTimeSeconds > 0) {
  const teamCode = getTeamCode(currentTeamName);
  
  const isCExGroup = CEX_GROUP.some(t => norm(currentTeamName).includes(norm(t).substring(0, 10)));
  
  if (isCExGroup) {
    slaLimitHours = 1;
  } else {
    const isWeekendDay = isWeekend(ticketCreatedAt);
    const isDuringOfficeHours = isWithinWorkingHours(ticketCreatedAt, teamCode);
    slaLimitHours = getSlaLimitHours(teamCode, isWeekendDay, isDuringOfficeHours);
  }
  
  const slaLimitSeconds = slaLimitHours * 3600;
  slaStatus = agentHandleTimeSeconds < slaLimitSeconds ? "Met" : "Missed";
}"""

new_sla_block = """// NEW SLA CALCULATION LOGIC
const uniqueTeamsCount = teamsVisited.size;
// Check for PSTF -> CEx Reversal exception
const isPSTFtoCExReversal = (
  uniqueTeamsCount === 2 &&
  teamsVisited.has("Pro Solutions Task Force") &&
  teamsVisited.has("CEx Reversal")
);

// 1. Determine Ticket SLA applicability
let ticketSlaApplicable = (uniqueTeamsCount <= 1 || isPSTFtoCExReversal);

// 2. Compute SLA limit hours
let slaLimitHours = 24; // Default fallback
const teamCode = getTeamCode(currentTeamName);
const isCExGroup = CEX_GROUP.some(t => norm(currentTeamName).includes(norm(t).substring(0, 10)));

if (isCExGroup) {
  slaLimitHours = 1;
} else if (teamCode) {
  const isWeekendDay = isWeekend(ticketCreatedAt);
  const isDuringOfficeHours = isWithinWorkingHours(ticketCreatedAt, teamCode);
  slaLimitHours = getSlaLimitHours(teamCode, isWeekendDay, isDuringOfficeHours);
}
const slaLimitSeconds = slaLimitHours * 3600;

// 3. Ticket SLA Status (Overall)
let ticketSlaStatus = "N/A";
if (ticketSlaApplicable && resolutionTimeSeconds > 0) {
  ticketSlaStatus = (resolutionTimeSeconds <= slaLimitSeconds) ? "Met" : "Missed";
}

// 4. Agent SLA Status (Separate)
let agentSlaStatus = "N/A";
if (agentHandleTimeSeconds > 0) {
  agentSlaStatus = (agentHandleTimeSeconds <= slaLimitSeconds) ? "Met" : "Missed";
}"""

# n8n strings often use escaped newlines \n
if old_sla_block not in js_code:
    # Try with escaped newlines
    old_sla_block_esc = old_sla_block.replace('\n', '\\n')
    new_sla_block_esc = new_sla_block.replace('\n', '\\n')
    js_code = js_code.replace(old_sla_block_esc, new_sla_block_esc)
else:
    js_code = js_code.replace(old_sla_block, new_sla_block)

# Update the return statement
old_return = """    "sla": slaStatus,
    "sla_limit_hours": slaLimitHours,"""
new_return = """    "sla": ticketSlaStatus,
    "sla_limit_hours": slaLimitHours,
    "ticket_sla_status": ticketSlaStatus,
    "ticket_sla_limit_hours": slaLimitHours,
    "ticket_sla_duration_seconds": resolutionTimeSeconds,
    "agent_sla_status": agentSlaStatus,
    "agent_handle_time_seconds": agentHandleTimeSeconds,"""

if old_return not in js_code:
    old_return_esc = old_return.replace('\n', '\\n')
    new_return_esc = new_return.replace('\n', '\\n')
    js_code = js_code.replace(old_return_esc, new_return_esc)
else:
    js_code = js_code.replace(old_return, new_return)

node['parameters']['jsCode'] = js_code

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)
print("Updated successfully")
