const fs = require('fs');
const path = require('path');

// Read the new JavaScript code
const newJsCode = fs.readFileSync(
    path.join(__dirname, 'transform_ticket_data_updated.js'),
    'utf-8'
);

// Read the existing workflow JSON
const workflow = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'All Team Ticket log.json'),
        'utf-8'
    )
);

// Find and update the Transform Ticket Data1 node
for (const node of workflow.nodes) {
    if (node.name === 'Transform Ticket Data1') {
        node.parameters.jsCode = newJsCode;
        console.log('✅ Updated Transform Ticket Data1 node');
        break;
    }
}

// Find and update the Upsert to Supabase node to include new fields
for (const node of workflow.nodes) {
    if (node.name === 'Upsert to Supabase') {
        // New jsonBody with all fields including new ones
        const newBody = `={{ JSON.stringify({ unique_id: $json.unique_id, date: $json.date || null, ticket_id: $json.ticket_id, ticket_creator_agent_name: $json.ticket_creator_agent_name, ticket_handler_agent_name: $json.ticket_handler_agent_name, resolution_time: $json.resolution_time, agent_handle_time: $json.agent_handle_time, ticket_status: $json.ticket_status, sla: $json.sla, sla_limit_hours: $json.sla_limit_hours, product_type: $json.product_type, resolved_during_office_hours: $json.resolved_during_office_hours, current_team: $json.current_team, issue_category: $json.issue_category, description_last_ticket_note: $json.description_last_ticket_note, forwarded: $json.forwarded, forwarded_to: $json.forwarded_to, ticket_creator_email: $json.ticket_creator_email, pro_solutions_task_force: $json.pro_solutions_task_force, cex_reversal: $json.cex_reversal, ticket_dependencies: $json.ticket_dependencies, payments_and_treasury: $json.payments_and_treasury, gb_email_communication: $json.gb_email_communication, tech_team: $json.tech_team, business_operations: $json.business_operations, platform_operations: $json.platform_operations, case_resolution: $json.case_resolution }) }}`;

        node.parameters.jsonBody = newBody;
        console.log('✅ Updated Upsert to Supabase node with new fields');
        break;
    }
}

// Write updated workflow
fs.writeFileSync(
    path.join(__dirname, 'All Team Ticket log.json'),
    JSON.stringify(workflow, null, 4),
    'utf-8'
);

console.log('✅ Workflow JSON updated successfully!');
console.log('\nNew fields added:');
console.log('  - sla_limit_hours');
console.log('  - product_type');
console.log('  - resolved_during_office_hours');
