-- ============================================================
-- SUPABASE RPC FUNCTIONS FOR DASHBOARD AGGREGATION
-- Run this entire file in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. INDEXES: Speed up queries on commonly filtered columns
CREATE INDEX IF NOT EXISTS idx_ticket_logs_date ON ticket_logs(date);
CREATE INDEX IF NOT EXISTS idx_ticket_logs_team ON ticket_logs(current_team);
CREATE INDEX IF NOT EXISTS idx_ticket_logs_handler ON ticket_logs(ticket_handler_agent_name);
CREATE INDEX IF NOT EXISTS idx_ticket_logs_sla ON ticket_logs(ticket_sla_status);
CREATE INDEX IF NOT EXISTS idx_ticket_logs_category ON ticket_logs(issue_category);
CREATE INDEX IF NOT EXISTS idx_ticket_logs_duration ON ticket_logs(ticket_sla_duration_seconds);

-- ============================================================
-- 2. MAIN AGGREGATION FUNCTION
-- Returns all chart data as a single JSONB blob
-- ============================================================
CREATE OR REPLACE FUNCTION dashboard_aggregates(
  p_from       TEXT DEFAULT NULL,
  p_to         TEXT DEFAULT NULL,
  p_agents     TEXT[] DEFAULT NULL,
  p_teams      TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_sla        TEXT[] DEFAULT NULL,
  p_search     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH filtered AS (
    SELECT date, ticket_id, ticket_handler_agent_name, current_team,
           issue_category, ticket_sla_status, sla, ticket_sla_duration_seconds,
           agent_sla_status, agent_handle_time_seconds, resolved_during_office_hours,
           product_type, continent, country, description_last_ticket_note
    FROM ticket_logs
    WHERE (p_from IS NULL OR date >= p_from::date)
      AND (p_to   IS NULL OR date <= p_to::date)
      AND (p_agents IS NULL OR ticket_handler_agent_name = ANY(p_agents))
      AND (p_teams  IS NULL OR current_team = ANY(p_teams))
      AND (p_categories IS NULL OR issue_category = ANY(p_categories))
      AND (p_sla IS NULL OR COALESCE(ticket_sla_status, sla) = ANY(p_sla))
      AND (p_search IS NULL OR p_search = '' OR
           ticket_id::text ILIKE '%' || p_search || '%' OR
           description_last_ticket_note ILIKE '%' || p_search || '%' OR
           issue_category ILIKE '%' || p_search || '%')
  )
  SELECT jsonb_build_object(
    -- Summary cards
    'total', (SELECT COUNT(*) FROM filtered),
    'sla_met', (SELECT COUNT(*) FROM filtered WHERE COALESCE(ticket_sla_status, sla) = 'Met'),
    'sla_missed', (SELECT COUNT(*) FROM filtered WHERE COALESCE(ticket_sla_status, sla) = 'Missed'),
    'sla_na', (SELECT COUNT(*) FROM filtered WHERE COALESCE(ticket_sla_status, sla) NOT IN ('Met','Missed') OR (ticket_sla_status IS NULL AND sla IS NULL)),
    'avg_resolution_minutes', (SELECT ROUND(AVG(ticket_sla_duration_seconds / 60.0)::numeric, 1) FROM filtered WHERE ticket_sla_duration_seconds IS NOT NULL AND ticket_sla_duration_seconds > 0),

    -- Daily volume: { "2025-06-01": 120, ... }
    'daily', COALESCE((
      SELECT jsonb_object_agg(d, cnt ORDER BY d)
      FROM (SELECT date AS d, COUNT(*) AS cnt FROM filtered WHERE date IS NOT NULL GROUP BY date) sub
    ), '{}'::jsonb),

    -- Team distribution: { "CEx": 5000, ... }
    'teams', COALESCE((
      SELECT jsonb_object_agg(t, cnt)
      FROM (SELECT current_team AS t, COUNT(*) AS cnt FROM filtered WHERE current_team IS NOT NULL GROUP BY current_team ORDER BY cnt DESC) sub
    ), '{}'::jsonb),

    -- Handlers: { "John": 500, ... }
    'handlers', COALESCE((
      SELECT jsonb_object_agg(h, cnt)
      FROM (SELECT ticket_handler_agent_name AS h, COUNT(*) AS cnt FROM filtered WHERE ticket_handler_agent_name IS NOT NULL GROUP BY ticket_handler_agent_name ORDER BY cnt DESC) sub
    ), '{}'::jsonb),

    -- Categories: { "Billing": 2000, ... }
    'categories', COALESCE((
      SELECT jsonb_object_agg(c, cnt)
      FROM (SELECT COALESCE(issue_category, 'Uncategorized') AS c, COUNT(*) AS cnt FROM filtered GROUP BY c ORDER BY cnt DESC) sub
    ), '{}'::jsonb),

    -- Continents: { "Asia": 22000, ... }
    'continents', COALESCE((
      SELECT jsonb_object_agg(co, cnt)
      FROM (SELECT continent AS co, COUNT(*) AS cnt FROM filtered WHERE continent IS NOT NULL AND continent != '' GROUP BY continent ORDER BY cnt DESC) sub
    ), '{}'::jsonb),

    -- Countries: { "Bangladesh": 5000, ... }
    'countries', COALESCE((
      SELECT jsonb_object_agg(co, cnt)
      FROM (SELECT country AS co, COUNT(*) AS cnt FROM filtered WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY cnt DESC) sub
    ), '{}'::jsonb),

    -- Team SLA performance: [{ "team": "CEx", "total": 5000, "met": 4500, "missed": 300, "avg_res": 120.5 }, ...]
    'team_sla', COALESCE((
      SELECT jsonb_agg(row_to_json(sub) ORDER BY sub.total DESC)
      FROM (
        SELECT current_team AS team, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE COALESCE(ticket_sla_status, sla) = 'Met') AS met,
          COUNT(*) FILTER (WHERE COALESCE(ticket_sla_status, sla) = 'Missed') AS missed,
          COUNT(*) FILTER (WHERE COALESCE(ticket_sla_status, sla) NOT IN ('Met','Missed') OR (ticket_sla_status IS NULL AND sla IS NULL)) AS na,
          ROUND(AVG(ticket_sla_duration_seconds / 60.0) FILTER (WHERE ticket_sla_duration_seconds IS NOT NULL AND ticket_sla_duration_seconds > 0)::numeric, 1) AS avg_res
        FROM filtered
        WHERE current_team IS NOT NULL
        GROUP BY current_team
      ) sub
    ), '[]'::jsonb),

    -- Agent SLA performance: [{ "name": "John", "total": 500, "met": 450, "missed": 30, "na": 20, "avg_handle_min": 5.2 }, ...]
    'agent_sla', COALESCE((
      SELECT jsonb_agg(row_to_json(sub) ORDER BY sub.total DESC)
      FROM (
        SELECT ticket_handler_agent_name AS name, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE agent_sla_status = 'Met') AS met,
          COUNT(*) FILTER (WHERE agent_sla_status = 'Missed') AS missed,
          COUNT(*) FILTER (WHERE agent_sla_status IS NULL OR agent_sla_status NOT IN ('Met','Missed')) AS na,
          ROUND(AVG(agent_handle_time_seconds / 60.0) FILTER (WHERE agent_handle_time_seconds IS NOT NULL AND agent_handle_time_seconds > 0)::numeric, 1) AS avg_handle_min
        FROM filtered
        WHERE ticket_handler_agent_name IS NOT NULL
        GROUP BY ticket_handler_agent_name
      ) sub
    ), '[]'::jsonb),

    -- Product types: { "CFD": 40000, "Futures": 30000 }
    'product_types', COALESCE((
      SELECT jsonb_object_agg(pt, cnt)
      FROM (
        SELECT CASE
          WHEN LOWER(product_type) LIKE '%cfd%' OR LOWER(product_type) LIKE '%stellar%' OR LOWER(product_type) LIKE '%instant%' THEN 'CFD'
          WHEN LOWER(product_type) LIKE '%futures%' THEN 'Futures'
          ELSE product_type
        END AS pt, COUNT(*) AS cnt
        FROM filtered
        WHERE product_type IS NOT NULL AND product_type != ''
        GROUP BY pt ORDER BY cnt DESC
      ) sub
    ), '{}'::jsonb),

    -- Avg Resolution by work/non-work hours
    'avg_res_work', COALESCE((
      SELECT jsonb_build_object(
        'work_sum', SUM(ticket_sla_duration_seconds / 60.0) FILTER (WHERE resolved_during_office_hours = true OR LOWER(current_team) LIKE '%pro solution%' OR LOWER(current_team) LIKE '%cex reversal%' OR LOWER(current_team) LIKE '%ticket dependencies%'),
        'work_count', COUNT(*) FILTER (WHERE (resolved_during_office_hours = true OR LOWER(current_team) LIKE '%pro solution%' OR LOWER(current_team) LIKE '%cex reversal%' OR LOWER(current_team) LIKE '%ticket dependencies%') AND ticket_sla_duration_seconds IS NOT NULL AND ticket_sla_duration_seconds > 0),
        'nonwork_sum', SUM(ticket_sla_duration_seconds / 60.0) FILTER (WHERE resolved_during_office_hours = false AND LOWER(current_team) NOT LIKE '%pro solution%' AND LOWER(current_team) NOT LIKE '%cex reversal%' AND LOWER(current_team) NOT LIKE '%ticket dependencies%'),
        'nonwork_count', COUNT(*) FILTER (WHERE resolved_during_office_hours = false AND LOWER(current_team) NOT LIKE '%pro solution%' AND LOWER(current_team) NOT LIKE '%cex reversal%' AND LOWER(current_team) NOT LIKE '%ticket dependencies%' AND ticket_sla_duration_seconds IS NOT NULL AND ticket_sla_duration_seconds > 0)
      ) FROM filtered
      WHERE ticket_sla_duration_seconds IS NOT NULL AND ticket_sla_duration_seconds > 0
    ), '{"work_sum":0,"work_count":0,"nonwork_sum":0,"nonwork_count":0}'::jsonb)

  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 3. FILTER OPTIONS FUNCTION
-- Returns distinct values for dropdown filters
-- ============================================================
CREATE OR REPLACE FUNCTION dashboard_filter_options()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'agents', COALESCE((SELECT jsonb_agg(DISTINCT ticket_handler_agent_name ORDER BY ticket_handler_agent_name) FROM ticket_logs WHERE ticket_handler_agent_name IS NOT NULL), '[]'::jsonb),
    'teams',  COALESCE((SELECT jsonb_agg(DISTINCT current_team ORDER BY current_team) FROM ticket_logs WHERE current_team IS NOT NULL), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(DISTINCT issue_category ORDER BY issue_category) FROM ticket_logs WHERE issue_category IS NOT NULL), '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- 4. TABLE PAGE FUNCTION
-- Returns one page of ticket rows with server-side sort/filter/pagination
-- ============================================================
CREATE OR REPLACE FUNCTION dashboard_table_page(
  p_from       TEXT DEFAULT NULL,
  p_to         TEXT DEFAULT NULL,
  p_agents     TEXT[] DEFAULT NULL,
  p_teams      TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_sla        TEXT[] DEFAULT NULL,
  p_search     TEXT DEFAULT NULL,
  p_sort_col   TEXT DEFAULT 'date',
  p_sort_dir   TEXT DEFAULT 'desc',
  p_offset     INT  DEFAULT 0,
  p_limit      INT  DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  result JSONB;
  total_count BIGINT;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO total_count
  FROM ticket_logs
  WHERE (p_from IS NULL OR date >= p_from::date)
    AND (p_to   IS NULL OR date <= p_to::date)
    AND (p_agents IS NULL OR ticket_handler_agent_name = ANY(p_agents))
    AND (p_teams  IS NULL OR current_team = ANY(p_teams))
    AND (p_categories IS NULL OR issue_category = ANY(p_categories))
    AND (p_sla IS NULL OR COALESCE(ticket_sla_status, sla) = ANY(p_sla))
    AND (p_search IS NULL OR p_search = '' OR
         ticket_id::text ILIKE '%' || p_search || '%' OR
         description_last_ticket_note ILIKE '%' || p_search || '%' OR
         issue_category ILIKE '%' || p_search || '%');

  -- Get page rows
  SELECT jsonb_build_object(
    'total', total_count,
    'rows', COALESCE((
      SELECT jsonb_agg(row_to_json(sub))
      FROM (
        SELECT date, ticket_id, ticket_handler_agent_name, current_team,
               resolution_time, COALESCE(ticket_sla_status, sla) AS sla_status,
               issue_category, intercom_id,
               description_last_ticket_note, continent, country, product_type,
               (ticket_sla_duration_seconds / 60.0) AS resolution_time_minutes, agent_sla_status, agent_handle_time_seconds,
               resolved_during_office_hours, created_at
        FROM ticket_logs
        WHERE (p_from IS NULL OR date >= p_from::date)
          AND (p_to   IS NULL OR date <= p_to::date)
          AND (p_agents IS NULL OR ticket_handler_agent_name = ANY(p_agents))
          AND (p_teams  IS NULL OR current_team = ANY(p_teams))
          AND (p_categories IS NULL OR issue_category = ANY(p_categories))
          AND (p_sla IS NULL OR COALESCE(ticket_sla_status, sla) = ANY(p_sla))
          AND (p_search IS NULL OR p_search = '' OR
               ticket_id::text ILIKE '%' || p_search || '%' OR
               description_last_ticket_note ILIKE '%' || p_search || '%' OR
               issue_category ILIKE '%' || p_search || '%')
        ORDER BY
          CASE WHEN p_sort_dir = 'asc' THEN
            CASE p_sort_col
              WHEN 'date' THEN date::text
              WHEN 'ticket_id' THEN ticket_id::text
              WHEN 'ticket_handler_agent_name' THEN ticket_handler_agent_name::text
              WHEN 'current_team' THEN current_team::text
              WHEN 'resolution_time' THEN resolution_time::text
              WHEN 'sla' THEN COALESCE(ticket_sla_status, sla)::text
              WHEN 'issue_category' THEN issue_category::text
              ELSE date::text
            END
          END ASC NULLS LAST,
          CASE WHEN p_sort_dir = 'desc' THEN
            CASE p_sort_col
              WHEN 'date' THEN date::text
              WHEN 'ticket_id' THEN ticket_id::text
              WHEN 'ticket_handler_agent_name' THEN ticket_handler_agent_name::text
              WHEN 'current_team' THEN current_team::text
              WHEN 'resolution_time' THEN resolution_time::text
              WHEN 'sla' THEN COALESCE(ticket_sla_status, sla)::text
              WHEN 'issue_category' THEN issue_category::text
              ELSE date::text
            END
          END DESC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) sub
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. GRANT PERMISSIONS
-- Allow the anon key to call these functions
-- ============================================================
GRANT EXECUTE ON FUNCTION dashboard_aggregates(TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT) TO anon;
GRANT EXECUTE ON FUNCTION dashboard_filter_options() TO anon;
GRANT EXECUTE ON FUNCTION dashboard_table_page(TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT, INT, INT) TO anon;

-- Done! After running this, refresh your dashboard.
