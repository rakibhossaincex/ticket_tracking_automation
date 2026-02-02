-- SQL commands to add new columns to ticket_logs table
-- Run these in Supabase SQL Editor

-- Add product_type column (text, nullable)
ALTER TABLE ticket_logs 
ADD COLUMN IF NOT EXISTS product_type TEXT;

-- Add sla_limit_hours column (numeric, nullable)
ALTER TABLE ticket_logs 
ADD COLUMN IF NOT EXISTS sla_limit_hours NUMERIC;

-- Add resolved_during_office_hours column (boolean, nullable)
ALTER TABLE ticket_logs 
ADD COLUMN IF NOT EXISTS resolved_during_office_hours BOOLEAN;

-- Create index on product_type for faster queries
CREATE INDEX IF NOT EXISTS idx_ticket_logs_product_type 
ON ticket_logs(product_type);

-- Create index on resolved_during_office_hours for faster queries
CREATE INDEX IF NOT EXISTS idx_ticket_logs_office_hours 
ON ticket_logs(resolved_during_office_hours);

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'ticket_logs' 
AND column_name IN ('product_type', 'sla_limit_hours', 'resolved_during_office_hours');
