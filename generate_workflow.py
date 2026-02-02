
import json

START_UNIX = 1768413600 # Jan 15, 2026

js_code_main = """// ALL TEAM TICKET LOG - Enhanced with Product Type, Category-based SLA, Working Hours
// Date range: Tickets RESOLVED starting Jan 15, 2026

const START_UNIX = 1768413600; // Jan 15, 2026
const NOW_UNIX = Math.floor(Date.now() / 1000);

const TRACKED_TEAMS = [
  "Pro Solutions Task Force",
  "CEx Reversal",
  "Ticket Dependencies",
  "Payments and Treasury",
  "GB Email Communication",
  "Tech Team",
  "Business Operations",
  "Platform Operations",
  "Case Resolution"
];

const CEX_GROUP = ["Pro Solutions Task Force", "CEx Reversal", "Ticket Dependencies"];

function getTeamCode(teamName) {
  const tn = (teamName || "").toLowerCase();
  if (tn.includes("pro solutions") || tn.includes("cex reversal") || tn.includes("ticket dependencies")) return "CEx";
  if (tn.includes("business operations")) return "BO";
  if (tn.includes("payments") || tn.includes("treasury") || tn.includes("gb email")) return "PT";
  if (tn.includes("platform operations")) return "PO";
  if (tn.includes("tech team")) return "TT";
  if (tn.includes("case resolution")) return "CR";
  return "";
}

const TEAM_WORKING_HOURS = {
  "CEx": { start: 7.25, end: 21.75 },
  "PT": { start: 9, end: 18 },
  "TT": { start: 9, end: 18 },
  "PO": { start: 8.5, end: 17.5 },
  "CR": { start: 8.5, end: 17.5 },
  "BO": { start: 8.5, end: 17.5 }
};

const SLA_LIMITS = {
  "CEx": { weekdayOffice: 1, weekdayAfter: 1, weekendOffice: 1, weekendAfter: 1 },
  "BO": { weekdayOffice: 12, weekdayAfter: 24, weekendOffice: 12, weekendAfter: 24 },
  "PT": { weekdayOffice: 12, weekdayAfter: 12, weekendOffice: 24, weekendAfter: 24 },
  "PO": { weekdayOffice: 3, weekdayAfter: 18, weekendOffice: 24, weekendAfter: 24 },
  "TT": { weekdayOffice: 8, weekdayAfter: 20, weekendOffice: 72, weekendAfter: 72 },
  "CR": { weekdayOffice: 3, weekdayAfter: 17, weekendOffice: 54, weekendAfter: 54 }
};

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\\s*\\/?>/gi, "\\n")
    .replace(/<\\/p>/gi, "\\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function toISODate(unixSeconds) {
  const n = (typeof unixSeconds === "number") ? unixSeconds : parseInt(unixSeconds, 10);
  if (!n || Number.isNaN(n)) return "";
  const gmt6Epoch = (n + 21600) * 1000;
  return new Date(gmt6Epoch).toISOString().slice(0, 10);
}

function norm(s) { return (s || "").toString().trim().toLowerCase(); }

function getAuthor(part) {
  const a = part?.author || part?.created_by || part?.creator || {};
  return {
    id: a?.id ? String(a.id) : "",
    name: a?.name || "",
    email: a?.email || "",
    type: a?.type || ""
  };
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  let result = "";
  if (days > 0) result += days + "d ";
  if (hours > 0) result += hours + "h ";
  if (minutes > 0 || result === "") result += minutes + "m";
  return result.trim();
}

function isWithinWorkingHours(unixTimestamp, teamCode) {
  if (!unixTimestamp || !teamCode) return true;
  const hours = TEAM_WORKING_HOURS[teamCode];
  if (!hours) return true;
  const gmt6Ms = (unixTimestamp + 21600) * 1000;
  const date = new Date(gmt6Ms);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  return hour >= hours.start && hour < hours.end;
}

function isWeekend(unixTimestamp) {
  if (!unixTimestamp) return false;
  const gmt6Ms = (unixTimestamp + 21600) * 1000;
  const date = new Date(gmt6Ms);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function getSlaLimitHours(teamCode, isWeekendDay, isDuringOfficeHours) {
  const limits = SLA_LIMITS[teamCode];
  if (!limits) return 24;
  if (isWeekendDay) {
    return isDuringOfficeHours ? limits.weekendOffice : limits.weekendAfter;
  } else {
    return isDuringOfficeHours ? limits.weekdayOffice : limits.weekdayAfter;
  }
}

const ticket = $json || {};
const ticketDisplayId = String(ticket.ticket_id || ticket.id || "");
const ticketState = norm(ticket.ticket_state || ticket.state || "");
const ticketStateLabel = ticket.ticket_state_internal_label || ticket.ticket_state_external_label || ticket.ticket_state || "";
const isResolved = (ticketState === "resolved" || ticketState === "closed");

let productType = "";
const ticketAttrs = ticket.ticket_attributes || {};
for (const key of Object.keys(ticketAttrs)) {
  if (key.toLowerCase().includes("product") && key.toLowerCase().includes("type")) {
    productType = String(ticketAttrs[key] || "");
    break;
  }
}
if (!productType && ticketAttrs["Product Type"]) {
  productType = String(ticketAttrs["Product Type"]);
}

const ptLower = productType.toLowerCase();
if (ptLower === "cfds" || ptLower === "cfd") {
  productType = "CFD";
} else if (ptLower === "futures") {
  productType = "Futures";
} else if (ptLower.includes("stellar") || ptLower.includes("instant")) {
  productType = "CFD";
}

let issueCategory = "";
if (ticket.ticket_type && ticket.ticket_type.name) {
  issueCategory = ticket.ticket_type.name;
} else if (ticket.custom_attributes && ticket.custom_attributes.ticket_type) {
  issueCategory = ticket.custom_attributes.ticket_type;
}
if (!issueCategory) {
  const titleRaw = ticket?.ticket_attributes?._default_title_ || ticket?.title || ticket?.subject || "";
  issueCategory = stripHtml(titleRaw);
}

const contact = (ticket?.contacts?.contacts && ticket.contacts.contacts[0]) || (Array.isArray(ticket?.contacts) ? ticket.contacts[0] : null);
const contactName = contact?.name || "";
const contactEmail = contact?.email || "";

let parts = ticket.ticket_parts || [];
if (!Array.isArray(parts)) {
  const tp = ticket.ticket_parts || {};
  parts = Array.isArray(tp.ticket_parts) ? tp.ticket_parts : (Array.isArray(tp.data) ? tp.data : []);
}
parts.sort((a, b) => (a?.created_at || 0) - (b?.created_at || 0));

const ticketCreatedAt = ticket.created_at || 0;
let resolvedAt = 0;
let resolverFromCloseEvent = "";

if (isResolved && ticket.state_updated_at && ticket.state_updated_at > 0) {
  resolvedAt = ticket.state_updated_at;
}

if (!resolvedAt) {
  for (const p of parts) {
    const currentState = norm(p?.ticket_state || p?.ticket_state_internal_label || "");
    const previousState = norm(p?.previous_ticket_state || "");
    const partCreatedAt = p.created_at || 0;
    const isResolvedState = currentState.includes("resolved") || currentState.includes("closed");
    const wasNotResolvedBefore = previousState && !previousState.includes("resolved") && !previousState.includes("closed");
    if (isResolvedState && (wasNotResolvedBefore || !previousState)) {
      if (partCreatedAt > resolvedAt) {
        resolvedAt = partCreatedAt;
        const au = getAuthor(p);
        if (au.type === "admin" && au.name) resolverFromCloseEvent = au.name;
      }
    }
    const partType = norm(p?.part_type || p?.event_type || p?.type || "");
    if (partType === "close" || partType === "ticket_state_updated" || partType.includes("resolved") || partType.includes("closed")) {
      if (isResolvedState && partCreatedAt > resolvedAt) {
        resolvedAt = partCreatedAt;
        const au = getAuthor(p);
        if (au.type === "admin" && au.name) resolverFromCloseEvent = au.name;
      }
    }
  }
}
if (!resolvedAt && isResolved) resolvedAt = ticket.created_at || 0;

const resolutionTimeSeconds = (resolvedAt && ticketCreatedAt && resolvedAt > ticketCreatedAt) ? (resolvedAt - ticketCreatedAt) : 0;
const resolutionTime = formatDuration(resolutionTimeSeconds);
const resolvedAfterStart = resolvedAt >= START_UNIX;
const resolvedDateStr = toISODate(resolvedAt);

let creatorName = "";
let creatorEmail = "";
const firstAdminPart = parts.find(p => getAuthor(p).type === "admin");
if (firstAdminPart) {
  const au = getAuthor(firstAdminPart);
  creatorName = au.name;
  creatorEmail = au.email;
} else {
  creatorName = contactName;
  creatorEmail = contactEmail;
}

const teamsVisited = new Set();
let allAssignmentTimes = [];
let lastAdminNoteText = "";
let lastAssignedAdmin = "";
const currentTeamId = String(ticket.team_assignee_id || "");
const sd = $getWorkflowStaticData('global');
const teamIdToName = sd.teamIdToName || {};
const currentTeamName = teamIdToName[currentTeamId] || "";
if (currentTeamName) teamsVisited.add(currentTeamName);

for (const p of parts) {
  const au = getAuthor(p);
  const body = stripHtml(p?.body || p?.comment || p?.note || "");
  const partType = norm(p?.part_type || p?.event_type || p?.type || "");
  const partCreatedAt = p.created_at || 0;
  if (norm(au.type) === "admin" && body) lastAdminNoteText = body;
  if (partType.includes("assign") || partType === "team_assignment" || partType === "assignment" || partType === "assigned") {
    const assignedTo = p.assigned_to || p.assignee || {};
    if (assignedTo.type === "team") {
      const teamId = String(assignedTo.id || "");
      const teamName = assignedTo.name || teamIdToName[teamId] || "";
      if (teamName) teamsVisited.add(teamName);
    }
    if (partCreatedAt > 0) allAssignmentTimes.push(partCreatedAt);
    if (assignedTo.type === "admin" && assignedTo.name) lastAssignedAdmin = assignedTo.name;
  }
}

let handlerName = resolverFromCloseEvent || lastAssignedAdmin || "";

let agentHandleTime = "";
let agentHandleTimeSeconds = 0;
if (resolvedAt) {
  const validAssignments = allAssignmentTimes.filter(t => t > 0 && t <= resolvedAt).sort((a, b) => b - a);
  if (validAssignments.length > 0) {
    const lastAssignmentTime = validAssignments[0];
    agentHandleTimeSeconds = resolvedAt - lastAssignmentTime;
    agentHandleTime = formatDuration(agentHandleTimeSeconds);
  } else if (ticketCreatedAt > 0) {
    agentHandleTimeSeconds = resolvedAt - ticketCreatedAt;
    agentHandleTime = formatDuration(agentHandleTimeSeconds);
  }
}

let slaStatus = "";
let slaLimitHours = null;
const uniqueTeamsCount = teamsVisited.size;
const isPSTFtoCExReversal = (uniqueTeamsCount === 2 && teamsVisited.has("Pro Solutions Task Force") && teamsVisited.has("CEx Reversal"));
let slaApplicable = (uniqueTeamsCount <= 1 || isPSTFtoCExReversal);
if (!slaApplicable) slaStatus = "N/A";

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
}

let resolvedDuringOfficeHours = null;
if (resolvedAt) {
  const teamCode = getTeamCode(currentTeamName);
  resolvedDuringOfficeHours = isWithinWorkingHours(resolvedAt, teamCode);
}

const qualifies = isResolved && resolvedAfterStart;
const date = resolvedDateStr;
const uniqueId = date + "|" + ticketDisplayId;

const teamColumns = {};
for (const teamName of TRACKED_TEAMS) {
  teamColumns[teamName] = teamsVisited.has(teamName) ? "Yes" : "";
}

return {
  json: {
    "_filter_passed": qualifies,
    "unique_id": uniqueId,
    "date": date,
    "ticket_id": ticketDisplayId,
    "ticket_creator_agent_name": creatorName,
    "ticket_handler_agent_name": handlerName,
    "resolution_time": resolutionTime,
    "agent_handle_time": agentHandleTime,
    "ticket_status": ticketStateLabel,
    "sla": slaStatus,
    "sla_limit_hours": slaLimitHours,
    "product_type": productType,
    "resolved_during_office_hours": resolvedDuringOfficeHours,
    "current_team": currentTeamName,
    "issue_category": issueCategory,
    "description_last_ticket_note": lastAdminNoteText,
    "forwarded": false,
    "forwarded_to": "",
    "ticket_creator_email": creatorEmail,
    "pro_solutions_task_force": teamColumns["Pro Solutions Task Force"],
    "cex_reversal": teamColumns["CEx Reversal"],
    "ticket_dependencies": teamColumns["Ticket Dependencies"],
    "payments_and_treasury": teamColumns["Payments and Treasury"],
    "gb_email_communication": teamColumns["GB Email Communication"],
    "tech_team": teamColumns["Tech Team"],
    "business_operations": teamColumns["Business Operations"],
    "platform_operations": teamColumns["Platform Operations"],
    "case_resolution": teamColumns["Case Resolution"]
  }
};"""

workflow = {
    "nodes": [
        {
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": js_code_main
            },
            "id": "08ef9656-f2a1-44c4-8155-879bf54e4657",
            "name": "Transform Ticket Data1",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-2768, -2656]
        },
        {
            "parameters": {
                "rule": {
                    "interval": [{"field": "hours", "hoursInterval": 2}]
                }
            },
            "id": "02b274b2-91ba-4ef6-aefb-d7e668a96cf4",
            "name": "Schedule Trigger (Every 5 Minutes)",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.2,
            "position": [-4512, -2464]
        },
        {
            "parameters": {
                "jsCode": f"// Gate: Only process if we're past Jan 15, 2026\\nconst START_UNIX = {START_UNIX};\\nconst nowUnix = Math.floor(Date.now() / 1000);\\n\\nif (nowUnix < START_UNIX) return [];\\n\\nconst sd = $getWorkflowStaticData('global');\\nif (typeof sd.last_sync !== 'number') sd.last_sync = START_UNIX;\\n\\nreturn [{{ json: {{ start_unix: START_UNIX, now_unix: nowUnix, last_sync: sd.last_sync }} }}];\\n"
            },
            "id": "80ae2172-9ea0-4c49-ad7a-d096274f7460",
            "name": "Gate: Start on 2026-01-",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-4288, -2464]
        },
        {
            "parameters": {
                "url": "https://api.intercom.io/teams",
                "authentication": "predefinedCredentialType",
                "nodeCredentialType": "httpBearerAuth",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Accept", "value": "application/json"},
                        {"name": "Intercom-Version", "value": "2.11"}
                    ]
                },
                "options": {"response": {}}
            },
            "id": "a33ab951-8bde-4e9b-b214-46f828762984",
            "name": "List Teams",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [-4048, -2464],
            "credentials": {
                "httpBearerAuth": {"id": "NP8zyf9bSfqaxMj0", "name": "Bearer Auth account 3"}
            }
        },
        {
            "parameters": {
                "jsCode": "function ensureObj(x){ if (!x) return {}; if (typeof x === 'string'){ try { return JSON.parse(x); } catch { return {}; } } return x; }\\nconst resp = ensureObj($json);\\nconst teams = resp.teams || resp.data || [];\\nconst idToName = {};\\nconst nameToId = {};\\nfor (const t of teams) { if (!t || !t.id) continue; const name = (t.name || '').trim(); idToName[t.id] = name; if (name) nameToId[name.toLowerCase()] = t.id; }\\nconst sd = $getWorkflowStaticData('global');\\nsd.teamIdToName = idToName;\\nsd.teamNameToId = nameToId;\\nreturn [{ json: { idToName, nameToId } }];\\n"
            },
            "id": "ab761ae3-2180-43df-83d0-76c680fc2df1",
            "name": "Build Team Map",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-3824, -2464]
        },
        {
            "parameters": {
                "jsCode": f"const START_UNIX = {START_UNIX}; const NOW_UNIX = Math.floor(Date.now() / 1000); const TEAM_IDS = ['8314220','9644821','6681977','6533520','6681962','6921111','6547584','6682031','6661069','8009000']; const teamConditions = TEAM_IDS.map(id => ({{ field: 'team_assignee_id', operator: '=', value: id }})); const stateConditions = [ {{ field: 'state', operator: '=', value: 'resolved' }}, {{ field: 'state', operator: '=', value: 'closed' }} ]; const queryConditions = [ {{ field: 'updated_at', operator: '>=', value: START_UNIX }}, {{ field: 'updated_at', operator: '<=', value: NOW_UNIX }}, {{ operator: 'OR', value: stateConditions }}, {{ operator: 'OR', value: teamConditions }} ]; return [{{ json: {{ body: {{ query: {{ operator: 'AND', value: queryConditions }}, pagination: {{ per_page: 100 }}, sort: {{ field: 'updated_at', order: 'ascending' }} }}, meta: {{ start_unix: START_UNIX, end_unix: NOW_UNIX, mode: 'JAN_15_BULK_FETCH' }} }} }}];"
            },
            "id": "430fac88-8d7f-4130-8951-4461e99dea9d",
            "name": "Build HTTP Body",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-3616, -2464]
        },
        {
            "parameters": {
                "method": "POST",
                "url": "https://api.intercom.io/tickets/search",
                "authentication": "predefinedCredentialType",
                "nodeCredentialType": "httpBearerAuth",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"},
                        {"name": "Intercom-Version", "value": "2.11"}
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ $json.body }}",
                "options": {"response": {}}
            },
            "id": "0eb7514e-7315-446c-9592-5ad6404d65c1",
            "name": "Search Tickets",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [-3408, -2464],
            "credentials": {
                "httpBearerAuth": {"id": "3aJKqmWSz1EBLLuh", "name": "Bearer Auth account 4"}
            }
        },
        {
            "parameters": {
                "jsCode": f"const START_UNIX = {START_UNIX}; const input = $json || {{}}; const tickets = input.tickets || []; const results = []; for (const ticket of tickets) {{ const ticketId = ticket.id; const stateUpdatedAt = ticket.state_updated_at || 0; const state = (ticket.state || '').toLowerCase(); const isResolved = state === 'resolved' || state === 'closed'; if (isResolved && stateUpdatedAt > 0 && stateUpdatedAt < START_UNIX) continue; if (ticketId) results.push({{ json: {{ 'id': String(ticketId), 'ticket_id': String(ticket.ticket_id || ''), 'state': ticket.state || '', 'state_updated_at': stateUpdatedAt, 'team_assignee_id': ticket.team_assignee_id || '' }} }}); }} return results;"
            },
            "id": "96de9298-abfd-4ead-a8f3-26041c50d8f6",
            "name": "Extract Tickets1",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-3168, -2656]
        },
        {
            "parameters": {
                "url": "=https://api.intercom.io/tickets/{{$json[\"id\"]}}",
                "authentication": "predefinedCredentialType",
                "nodeCredentialType": "httpBearerAuth",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"},
                        {"name": "Intercom-Version", "value": "2.11"}
                    ]
                },
                "options": {"response": {}}
            },
            "id": "cfbfe6f5-da31-4449-a8c4-3cc2db60c7d4",
            "name": "Get Ticket Details",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [-2960, -2656],
            "credentials": {
                "httpBearerAuth": {"id": "Wb6mK3xsTXEujIUR", "name": "Bearer Auth account 5"}
            },
            "onError": "continueRegularOutput"
        },
        {
            "parameters": {
                "conditions": {
                    "boolean": [
                        {"value1": "={{ $json[\"_filter_passed\"] }}", "value2": True}
                    ]
                }
            },
            "id": "c0e09f56-bad7-459b-ac41-349b3530dbb0",
            "name": "Filter Passed?",
            "type": "n8n-nodes-base.if",
            "typeVersion": 1,
            "position": [-2528, -2656]
        },
        {
            "parameters": {
                "method": "POST",
                "url": "https://umkzssfympyhifdjptwf.supabase.co/rest/v1/ticket_logs?on_conflict=unique_id",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"},
                        {"name": "Prefer", "value": "resolution=merge-duplicates"},
                        {"name": "apikey", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3pzc2Z5bXB5aGlmZGpwdHdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk1MzkzMywiZXhwIjoyMDgzNTI5OTMzfQ.uLp84D6LmkkEL5rGgIp-EOuUX_vhNc82n-oHm6qWW-0"},
                        {"name": "Authorization", "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3pzc2Z5bXB5aGlmZGpwdHdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk1MzkzMywiZXhwIjoyMDgzNTI5OTMzfQ.uLp84D6LmkkEL5rGgIp-EOuUX_vhNc82n-oHm6qWW-0"}
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ unique_id: $json.unique_id, date: $json.date || null, ticket_id: $json.ticket_id, ticket_creator_agent_name: $json.ticket_creator_agent_name, ticket_handler_agent_name: $json.ticket_handler_agent_name, resolution_time: $json.resolution_time, agent_handle_time: $json.agent_handle_time, ticket_status: $json.ticket_status, sla: $json.sla, sla_limit_hours: $json.sla_limit_hours, product_type: $json.product_type, resolved_during_office_hours: $json.resolved_during_office_hours, current_team: $json.current_team, issue_category: $json.issue_category, description_last_ticket_note: $json.description_last_ticket_note, forwarded: $json.forwarded, forwarded_to: $json.forwarded_to, ticket_creator_email: $json.ticket_creator_email, pro_solutions_task_force: $json.pro_solutions_task_force, cex_reversal: $json.cex_reversal, ticket_dependencies: $json.ticket_dependencies, payments_and_treasury: $json.payments_and_treasury, gb_email_communication: $json.gb_email_communication, tech_team: $json.tech_team, business_operations: $json.business_operations, platform_operations: $json.platform_operations, case_resolution: $json.case_resolution }) }}",
                "options": {}
            },
            "id": "e1b1a5dc-5905-4b0d-8449-30c1a78174dc",
            "name": "Upsert to Supabase",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [-2192, -2672]
        },
        {
            "parameters": {
                "jsCode": "function clone(o) { return JSON.parse(JSON.stringify(o)); } function ensureObj(x) { if (!x) return {}; if (typeof x === 'string') { try { return JSON.parse(x); } catch { return {}; } } return x; } const resp = ensureObj($json); const pageNow = resp?.pages?.page ?? 1; const nextCursor = resp?.pages?.next?.starting_after ?? null; const baseBody = clone($(\"Build HTTP Body\").first().json.body); if (nextCursor) baseBody.pagination.starting_after = nextCursor; else delete baseBody.pagination.starting_after; return [{ json: { body: baseBody, has_next: Boolean(nextCursor) && pageNow < 2000, page_now: pageNow } }];"
            },
            "id": "f18af2aa-247e-4197-a766-e1889cef36fe",
            "name": "Paginate: Prepare next body",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-3168, -2464]
        },
        {
            "parameters": {},
            "id": "aa7bf43f-8638-414a-8659-60d337f758a4",
            "name": "Merge",
            "type": "n8n-nodes-base.merge",
            "typeVersion": 3.2,
            "position": [-2832, -2416]
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                    "conditions": [{"id": "ef34f615-6b27-4dd4-8386-54f5cc41d193", "leftValue": "={{ $json.has_next }}", "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                    "combinator": "and"
                },
                "options": {}
            },
            "id": "e74fdff6-2c36-437c-91b2-7094d118df50",
            "name": "If (Has Next Page?)",
            "type": "n8n-nodes-base.if",
            "typeVersion": 2.2,
            "position": [-2496, -2416]
        }
    ],
    "connections": {
        "Transform Ticket Data1": {"main": [[{"node": "Filter Passed?", "type": "main", "index": 0}]]},
        "Schedule Trigger (Every 5 Minutes)": {"main": [[{"node": "Gate: Start on 2026-01-", "type": "main", "index": 0}]]},
        "Gate: Start on 2026-01-": {"main": [[{"node": "List Teams", "type": "main", "index": 0}]]},
        "List Teams": {"main": [[{"node": "Build Team Map", "type": "main", "index": 0}]]},
        "Build Team Map": {"main": [[{"node": "Build HTTP Body", "type": "main", "index": 0}]]},
        "Build HTTP Body": {"main": [[{"node": "Search Tickets", "type": "main", "index": 0}]]},
        "Search Tickets": {"main": [[{"node": "Paginate: Prepare next body", "type": "main", "index": 0}, {"node": "Extract Tickets1", "type": "main", "index": 0}]]},
        "Extract Tickets1": {"main": [[{"node": "Get Ticket Details", "type": "main", "index": 0}]]},
        "Get Ticket Details": {"main": [[{"node": "Transform Ticket Data1", "type": "main", "index": 0}]]},
        "Filter Passed?": {"main": [[{"node": "Upsert to Supabase", "type": "main", "index": 0}], [{"node": "Merge", "type": "main", "index": 0}]]},
        "Upsert to Supabase": {"main": [[{"node": "Merge", "type": "main", "index": 0}]]},
        "Paginate: Prepare next body": {"main": [[{"node": "Merge", "type": "main", "index": 1}]]},
        "Merge": {"main": [[{"node": "If (Has Next Page?)", "type": "main", "index": 0}]]},
        "If (Has Next Page?)": {"main": [[{"node": "Search Tickets", "type": "main", "index": 0}]]}
    },
    "pinData": {},
    "meta": {
        "instanceId": "b076ee236eeb0f1e0d5cf68bfef91d2e6b976d3c37b7dea8eeb4131cf958e05f"
    }
}

with open("Bulk Fetch - Jan 15 to Now.json", "w") as f:
    json.dump(workflow, f, indent=2)
print("JSON is VALID and generated.")
