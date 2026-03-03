import csv
from datetime import datetime

supabase_file = r'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\ticket_logs_rows.csv'
intercom_file = r'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\reporting-dataset-export.aphmhtyj.85b77d19-0696-4c10-bc3b-87dcb70e4455.csv'
output_file = r'c:\Users\NEXT\.gemini\antigravity\scratch\pstf_automation\missing_ticket_ids.csv'

exclude_date = "2026-02-06"

def compare_tickets():
    print(f"Reading Supabase file: {supabase_file}")
    supabase_ids = set()
    with open(supabase_file, mode='r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tid = row.get('ticket_id')
            if tid:
                supabase_ids.add(tid.strip())
    
    print(f"Supabase unique ticket IDs found: {len(supabase_ids)}")

    print(f"Reading Intercom file and filtering: {intercom_file}")
    missing_tickets = []
    
    # Intercom file might have multiple header lines or specific encoding
    with open(intercom_file, mode='r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        for row in reader:
            intercom_tid = row.get('Ticket ID')
            created_at = row.get('Ticket created (Asia/Dhaka)')
            
            if not intercom_tid or not created_at:
                continue
            
            intercom_tid = intercom_tid.strip()
            # Extract date from "2026-02-05 23:57:56"
            date_part = created_at.split(' ')[0]
            
            if date_part == exclude_date:
                continue
            
            if intercom_tid not in supabase_ids:
                # Store the row information
                missing_tickets.append(row)
    
    print(f"Total missing tickets found: {len(missing_tickets)}")
    
    if missing_tickets:
        print(f"Writing results to {output_file}")
        keys = missing_tickets[0].keys()
        with open(output_file, mode='w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(missing_tickets)
        print("Done.")
    else:
        print("No missing tickets found matching the criteria.")

if __name__ == "__main__":
    compare_tickets()
