$jsCodeEnhanced = Get-Content "js_code_enhanced.txt" -Raw

$nodes = @(
    @{
        parameters  = @{ mode = "runOnceForEachItem"; jsCode = $jsCodeEnhanced }
        id          = "08ef9656-f2a1-44c4-8155-879bf54e4657"
        name        = "Transform Ticket Data1"
        type        = "n8n-nodes-base.code"
        typeVersion = 2
        position    = @(-2768, -2656)
    }
    @{
        parameters  = @{ rule = @{ interval = @( @{ field = "hours"; hoursInterval = 2 } ) } }
        id          = "02b274b2-91ba-4ef6-aefb-d7e668a96cf4"
        name        = "Schedule Trigger (Every 5 Minutes)"
        type        = "n8n-nodes-base.scheduleTrigger"
        typeVersion = 1.2
        position    = @(-4512, -2464)
    }
    @{
        parameters  = @{ jsCode = "const START_UNIX = 1768413600; const nowUnix = Math.floor(Date.now() / 1000); if (nowUnix < START_UNIX) return []; const sd = `$getWorkflowStaticData('global'); if (typeof sd.last_sync !== 'number') sd.last_sync = START_UNIX; return [{ json: { start_unix: START_UNIX, now_unix: nowUnix, last_sync: sd.last_sync } }];" }
        id          = "80ae2172-9ea0-4c49-ad7a-d096274f7460"
        name        = "Gate: Start on 2026-01-"
        type        = "n8n-nodes-base.code"
        typeVersion = 2
        position    = @(-4288, -2464)
    }
    @{
        parameters  = @{ 
            url                = "https://api.intercom.io/teams"
            authentication     = "predefinedCredentialType"
            nodeCredentialType = "httpBearerAuth"
            sendHeaders        = $true
            headerParameters   = @{ parameters = @( @{ name = "Accept"; value = "application/json" }, @{ name = "Intercom-Version"; value = "2.11" } ) }
            options            = @{ response = @{} }
        }
        id          = "a33ab951-8bde-4e9b-b214-46f828762984"
        name        = "List Teams"
        type        = "n8n-nodes-base.httpRequest"
        typeVersion = 4.3
        position    = @(-4048, -2464)
        credentials = @{ httpBearerAuth = @{ id = "NP8zyf9bSfqaxMj0"; name = "Bearer Auth account 3" } }
    }
    @{
        parameters  = @{ jsCode = "function ensureObj(x){ if (!x) return {}; if (typeof x === 'string'){ try { return JSON.parse(x); } catch { return {}; } } return x; } const resp = ensureObj(`$json); const teams = resp.teams || resp.data || []; const idToName = {}; const nameToId = {}; for (const t of teams) { if (!t || !t.id) continue; const name = (t.name || '').trim(); idToName[t.id] = name; if (name) nameToId[name.toLowerCase()] = t.id; } const sd = `$getWorkflowStaticData('global'); sd.teamIdToName = idToName; sd.teamNameToId = nameToId; return [{ json: { idToName, nameToId } }];" }
        id          = "ab761ae3-2180-43df-83d0-76c680fc2df1"
        name        = "Build Team Map"
        type        = "n8n-nodes-base.code"
        typeVersion = 2
        position    = @(-3824, -2464)
    }
    @{
        parameters  = @{ jsCode = "const START_UNIX = 1768413600; const NOW_UNIX = Math.floor(Date.now() / 1000); const TEAM_IDS = ['8314220','9644821','6681977','6533520','6681962','6921111','6547584','6682031','6661069','8009000']; const teamConditions = TEAM_IDS.map(id => ({ field: 'team_assignee_id', operator: '=', value: id })); const stateConditions = [ { field: 'state', operator: '=', value: 'resolved' }, { field: 'state', operator: '=', value: 'closed' } ]; const queryConditions = [ { field: 'updated_at', operator: '>=', value: START_UNIX }, { field: 'updated_at', operator: '<=', value: NOW_UNIX }, { operator: 'OR', value: stateConditions }, { operator: 'OR', value: teamConditions } ]; return [{ json: { body: { query: { operator: 'AND', value: queryConditions }, pagination: { per_page: 100 }, sort: { field: 'updated_at', order: 'ascending' } } } }];" }
        id          = "430fac88-8d7f-4130-8951-4461e99dea9d"
        name        = "Build HTTP Body"
        type        = "n8n-nodes-base.code"
        typeVersion = 2
        position    = @(-3616, -2464)
    }
    @{
        parameters  = @{ 
            method             = "POST"
            url                = "https://api.intercom.io/tickets/search"
            authentication     = "predefinedCredentialType"
            nodeCredentialType = "httpBearerAuth"
            sendHeaders        = $true
            headerParameters   = @{ parameters = @( @{ name = "Content-Type"; value = "application/json" }, @{ name = "Intercom-Version"; value = "2.11" } ) }
            sendBody           = $true
            specifyBody        = "json"
            jsonBody           = "={{ `$json.body }}"
            options            = @{ response = @{} }
        }
        id          = "0eb7514e-7315-446c-9592-5ad6404d65c1"
        name        = "Search Tickets"
        type        = "n8n-nodes-base.httpRequest"
        typeVersion = 4.3
        position    = @(-3408, -2464)
        credentials = @{ httpBearerAuth = @{ id = "3aJKqmWSz1EBLLuh"; name = "Bearer Auth account 4" } }
    }
    @{
        parameters  = @{ jsCode = "const START_UNIX = 1768413600; const input = `$json || {}; const tickets = input.tickets || []; const results = []; for (const ticket of tickets) { const ticketId = ticket.id; const stateUpdatedAt = ticket.state_updated_at || 0; const state = (ticket.state || '').toLowerCase(); const isResolved = state === 'resolved' || state === 'closed'; if (isResolved && stateUpdatedAt > 0 && stateUpdatedAt < START_UNIX) continue; if (ticketId) results.push({ json: { 'id': String(ticketId), 'ticket_id': String(ticket.ticket_id || ''), 'state': ticket.state || '', 'state_updated_at': stateUpdatedAt, 'team_assignee_id': ticket.team_assignee_id || '' } }); } return results;" }
        id          = "96de9298-abfd-4ead-a8f3-26041c50d8f6"
        name        = "Extract Tickets1"
        type        = "n8n-nodes-base.code"
        typeVersion = 2
        position    = @(-3168, -2656)
    }
    @{
        parameters  = @{ 
            url                = "=https://api.intercom.io/tickets/{{`$json['id']}}"
            authentication     = "predefinedCredentialType"
            nodeCredentialType = "httpBearerAuth"
            sendHeaders        = $true
            headerParameters   = @{ parameters = @( @{ name = "Content-Type"; value = "application/json" }, @{ name = "Intercom-Version"; value = "2.11" } ) }
            options            = @{ response = @{} }
        }
        id          = "cfbfe6f5-da31-4449-a8c4-3cc2db60c7d4"
        name        = "Get Ticket Details"
        type        = "n8n-nodes-base.httpRequest"
        typeVersion = 4.3
        position    = @(-2960, -2656)
        credentials = @{ httpBearerAuth = @{ id = "Wb6mK3xsTXEujIUR"; name = "Bearer Auth account 5" } }
        onError     = "continueRegularOutput"
    }
    @{
        parameters  = @{ conditions = @{ boolean = @( @{ value1 = "={{ `$json['_filter_passed'] }}"; value2 = $true } ) } }
        id          = "c0e09f56-bad7-459b-ac41-349b3530dbb0"
        name        = "Filter Passed?"
        type        = "n8n-nodes-base.if"
        typeVersion = 1
        position    = @(-2528, -2656)
    }
    @{
        parameters  = @{ 
            method           = "POST"
            url              = "https://umkzssfympyhifdjptwf.supabase.co/rest/v1/ticket_logs?on_conflict=unique_id"
            sendHeaders      = $true
            headerParameters = @{ parameters = @( @{ name = "Content-Type"; value = "application/json" }, @{ name = "Prefer"; value = "resolution=merge-duplicates" }, @{ name = "apikey"; value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3pzc2Z5bXB5aGlmZGpwdHdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk1MzkzMywiZXhwIjoyMDgzNTI5OTMzfQ.uLp84D6LmkkEL5rGgIp-EOuUX_vhNc82n-oHm6qWW-0" }, @{ name = "Authorization"; value = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3pzc2Z5bXB5aGlmZGpwdHdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk1MzkzMywiZXhwIjoyMDgzNTI5OTMzfQ.uLp84D6LmkkEL5rGgIp-EOuUX_vhNc82n-oHm6qWW-0" } ) }
            sendBody         = $true
            specifyBody      = "json"
            jsonBody         = "={{ JSON.stringify({ unique_id: `$json.unique_id, date: `$json.date || null, ticket_id: `$json.ticket_id, ticket_creator_agent_name: `$json.ticket_creator_agent_name, ticket_handler_agent_name: `$json.ticket_handler_agent_name, resolution_time: `$json.resolution_time, agent_handle_time: `$json.agent_handle_time, ticket_status: `$json.ticket_status, sla: `$json.sla, sla_limit_hours: `$json.sla_limit_hours, product_type: `$json.product_type, resolved_during_office_hours: `$json.resolved_during_office_hours, current_team: `$json.current_team, issue_category: `$json.issue_category, description_last_ticket_note: `$json.description_last_ticket_note, forwarded: `$json.forwarded, forwarded_to: `$json.forwarded_to, ticket_creator_email: `$json.ticket_creator_email, pro_solutions_task_force: `$json.pro_solutions_task_force, cex_reversal: `$json.cex_reversal, ticket_dependencies: `$json.ticket_dependencies, payments_and_treasury: `$json.payments_and_treasury, gb_email_communication: `$json.gb_email_communication, tech_team: `$json.tech_team, business_operations: `$json.business_operations, platform_operations: `$json.platform_operations, case_resolution: `$json.case_resolution }) }}"
            options          = @{}
        }
        id          = "e1b1a5dc-5905-4b0d-8449-30c1a78174dc"
        name        = "Upsert to Supabase"
        type        = "n8n-nodes-base.httpRequest"
        typeVersion = 4.3
        position    = @(-2192, -2672)
    }
    @{
        parameters  = @{ jsCode = "function clone(o) { return JSON.parse(JSON.stringify(o)); } function ensureObj(x) { if (!x) return {}; if (typeof x === 'string') { try { return JSON.parse(x); } catch { return {}; } } return x; } const resp = ensureObj(`$json); const pageNow = resp?.pages?.page ?? 1; const nextCursor = resp?.pages?.next?.starting_after ?? null; const baseBody = clone($('Build HTTP Body').first().json.body); if (nextCursor) baseBody.pagination.starting_after = nextCursor; else delete baseBody.pagination.starting_after; return [{ json: { body: baseBody, has_next: Boolean(nextCursor) && pageNow < 2000, page_now: pageNow } }];" }
        id          = "f18af2aa-247e-4197-a766-e1889cef36fe"
        name        = "Paginate: Prepare next body"
        type        = "n8n-nodes-base.code"
        typeVersion = 2
        position    = @(-3168, -2464)
    }
    @{
        parameters  = @{}
        id          = "aa7bf43f-8638-414a-8659-60d337f758a4"
        name        = "Merge"
        type        = "n8n-nodes-base.merge"
        typeVersion = 3.2
        position    = @(-2832, -2416)
    }
    @{
        parameters  = @{ conditions = @{ options = @{ caseSensitive = $true; leftValue = ""; typeValidation = "strict"; version = 2 }; conditions = @( @{ id = "ef34f615-6b27-4dd4-8386-54f5cc41d193"; leftValue = "={{ `$json.has_next }}"; rightValue = ""; operator = @{ type = "boolean"; operation = "true"; singleValue = $true } } ); combinator = "and" }; options = @{} }
        id          = "e74fdff6-2c36-437c-91b2-7094d118df50"
        name        = "If (Has Next Page?)"
        type        = "n8n-nodes-base.if"
        typeVersion = 2.2
        position    = @(-2496, -2416)
    }
)

$connections = @{
    "Transform Ticket Data1"             = @{ main = @( @( @{ node = "Filter Passed?"; type = "main"; index = 0 } ) ) }
    "Schedule Trigger (Every 5 Minutes)" = @{ main = @( @( @{ node = "Gate: Start on 2026-01-"; type = "main"; index = 0 } ) ) }
    "Gate: Start on 2026-01-"            = @{ main = @( @( @{ node = "List Teams"; type = "main"; index = 0 } ) ) }
    "List Teams"                         = @{ main = @( @( @{ node = "Build Team Map"; type = "main"; index = 0 } ) ) }
    "Build Team Map"                     = @{ main = @( @( @{ node = "Build HTTP Body"; type = "main"; index = 0 } ) ) }
    "Build HTTP Body"                    = @{ main = @( @( @{ node = "Search Tickets"; type = "main"; index = 0 } ) ) }
    "Search Tickets"                     = @{ main = @( @( @{ node = "Paginate: Prepare next body"; type = "main"; index = 0 }, @{ node = "Extract Tickets1"; type = "main"; index = 0 } ) ) }
    "Extract Tickets1"                   = @{ main = @( @( @{ node = "Get Ticket Details"; type = "main"; index = 0 } ) ) }
    "Get Ticket Details"                 = @{ main = @( @( @{ node = "Transform Ticket Data1"; type = "main"; index = 0 } ) ) }
    "Filter Passed?"                     = @{ main = @( @( @{ node = "Upsert to Supabase"; type = "main"; index = 0 } ), @( @{ node = "Merge"; type = "main"; index = 0 } ) ) }
    "Upsert to Supabase"                 = @{ main = @( @( @{ node = "Merge"; type = "main"; index = 0 } ) ) }
    "Paginate: Prepare next body"        = @{ main = @( @( @{ node = "Merge"; type = "main"; index = 1 } ) ) }
    "Merge"                              = @{ main = @( @( @{ node = "If (Has Next Page?)"; type = "main"; index = 0 } ) ) }
    "If (Has Next Page?)"                = @{ main = @( @( @{ node = "Search Tickets"; type = "main"; index = 0 } ) ) }
}

$workflow = @{
    nodes       = $nodes
    connections = $connections
    pinData     = @{}
    meta        = @{
        instanceId = "b076ee236eeb0f1e0d5cf68bfef91d2e6b976d3c37b7dea8eeb4131cf958e05f"
    }
}

$workflow | ConvertTo-Json -Depth 100 | Set-Content "Bulk Fetch - Jan 15 to Now.json"
