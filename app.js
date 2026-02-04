/* ============================================
   TICKET ANALYTICS DASHBOARD - APP.JS
   Supabase connection, filtering, charts
============================================ */

// Supabase Configuration
const SUPABASE_URL = 'https://umkzssfympyhifdjptwf.supabase.co';
// Using service_role key for read access (same as workflow)
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3pzc2Z5bXB5aGlmZGpwdHdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk1MzkzMywiZXhwIjoyMDgzNTI5OTMzfQ.uLp84D6LmkkEL5rGgIp-EOuUX_vhNc82n-oHm6qWW-0';

// Create client with a different variable name to avoid conflict with CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('✅ Supabase client initialized');

// State
let allData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 25;
let sortColumn = 'date';
let sortDirection = 'desc';

// Multi-select states
const selectedAgents = new Set();
const selectedTeams = new Set();
const selectedSla = new Set();
const selectedCategories = new Set();

const dropdownRegistry = new Set();

function closeAllDropdowns(exceptEl = null) {
    dropdownRegistry.forEach(dd => {
        if (dd !== exceptEl) dd.classList.remove('open');
    });
}

// GLOBAL FILTERS (Single source of truth)
const filters = {
    from: null,   // ISO string (start of day)
    to: null,     // ISO string (end of day)
    agents: selectedAgents,
    teams: selectedTeams,
    categories: selectedCategories,
    sla: selectedSla,
    search: '',
    durationUnit: 'hour' // min, hour, day
};

const uiUnits = {
    teamSla: 'hour',
    avgRes: 'hour',
    agentSla: 'hour', // min, hour, day - for agent SLA table
    dailyView: 'day' // day, week, month - default to day
};

// CANONICAL SLA CALCULATION
function calculateSlaStats(tickets) {
    let met = 0, missed = 0, na = 0;
    for (const t of tickets) {
        // Use ticket_sla_status (new) or fall back to sla (old)
        const status = t.ticket_sla_status || t.sla;
        if (status === 'Met') met++;
        else if (status === 'Missed') missed++;
        else na++;
    }
    const total = met + missed + na;
    const metPct = total ? (met / total) * 100 : 0;
    return { met, missed, na, total, metPct };
}

// DURATION FORMATTER
// DURATION FORMATTER
function formatDuration(minutes, unit) {
    const m = Math.max(0, Math.round(minutes || 0));
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const mm = m % 60;

    if (unit === 'day') {
        if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
        return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
    }
    if (unit === 'hour') {
        const totalH = d * 24 + h;
        if (totalH > 0) return mm > 0 ? `${totalH}h ${mm}m` : `${totalH}h`;
        return `${mm}m`;
    }
    return `${m}m`;
}

// TEAM SLA THRESHOLDS (minutes) for Agent Table only
const TEAM_SLA_MINUTES = {
    'Pro Solutions Task Force': 60,
    'Pro Solution Task Force': 60,
    'Ticket Dependencies': 1440, // 24h
    'CEx Reversal': 120, // 2h
    'Tech Team': 1440,
    'Platform Operations': 1440,
    'Payments and Treasury': 1440,
    'Back Office': 1440,
    'Customer Experience': 240, // 4h
    'GB Email Communication': 480 // 8h
};

function getShortTeamName(fullName) {
    const abbreviations = {
        'Pro Solutions Task Force': 'PSTF', 'Pro Solution Task Force': 'PSTF',
        'Ticket Dependencies': 'T Deps', 'CEx Reversal': 'CEx Rev',
        'Tech Team': 'TT', 'Platform Operations': 'PO',
        'Payments and Treasury': 'P&T', 'Back Office': 'BO',
        'Customer Experience': 'CEx', 'GB Email Communication': 'GB Email'
    };
    return abbreviations[fullName] || fullName;
}

function shortenLabel(str, max = 28) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// DOUGHNUT PERCENT CALLOUTS PLUGIN
const doughnutPercentCallouts = {
    id: 'doughnutPercentCallouts',
    afterDatasetsDraw(chart, args, opts) {
        const { ctx, chartArea } = chart;
        const di = opts?.datasetIndex ?? 0;
        const meta = chart.getDatasetMeta(di);
        const ds = chart.data?.datasets?.[di];
        if (!meta?.data?.length || !ds?.data?.length) return;

        const values = ds.data.map(v => +v || 0);
        const total = values.reduce((a, b) => a + b, 0) || 1;

        const minPct = opts?.minPct ?? 1;
        const pad = opts?.pad ?? 16;
        const radial = opts?.radial ?? 16;
        const horiz = opts?.horiz ?? 24;
        const minGap = opts?.minGap ?? 14;
        const font = opts?.font ?? '12px Inter, system-ui, Arial';

        const leftItems = [];
        const rightItems = [];

        meta.data.forEach((arc, i) => {
            const v = values[i];
            if (v <= 0) return;
            const pct = (v / total) * 100;
            if (pct < minPct) return;

            const angle = (arc.startAngle + arc.endAngle) / 2;
            const cx = arc.x, cy = arc.y, r = arc.outerRadius;
            const x0 = cx + Math.cos(angle) * r;
            const y0 = cy + Math.sin(angle) * r;
            const x1 = cx + Math.cos(angle) * (r + radial);
            const y1 = cy + Math.sin(angle) * (r + radial);
            const isRight = Math.cos(angle) >= 0;
            const x2 = x1 + (isRight ? horiz : -horiz);

            const item = { x0, y0, x1, y1, x2, y2: y1, isRight, text: `${pct.toFixed(1)}%` };
            if (isRight) rightItems.push(item);
            else leftItems.push(item);
        });

        function resolve(arr) {
            if (!arr.length) return;
            arr.sort((a, b) => a.y2 - b.y2);
            const minY = pad;
            const maxY = chart.height - pad;

            // Simple stacking
            for (let i = 0; i < arr.length; i++) {
                if (i === 0) arr[i].y2 = Math.max(arr[i].y2, minY);
                else arr[i].y2 = Math.max(arr[i].y2, arr[i - 1].y2 + minGap);
            }
            // push back from bottom
            let overflow = arr[arr.length - 1].y2 - maxY;
            if (overflow > 0) {
                for (let i = arr.length - 1; i >= 0; i--) {
                    arr[i].y2 -= overflow;
                    if (i < arr.length - 1) {
                        arr[i].y2 = Math.min(arr[i].y2, arr[i + 1].y2 - minGap);
                    }
                }
            }
            // re-check top
            if (arr[0].y2 < minY) {
                const shift = minY - arr[0].y2;
                for (let i = 0; i < arr.length; i++) arr[i].y2 += shift;
            }
        }

        resolve(leftItems);
        resolve(rightItems);

        ctx.save();
        ctx.font = font;
        ctx.fillStyle = opts?.color ?? '#E6E8FF';
        ctx.strokeStyle = opts?.lineColor ?? 'rgba(230,232,255,0.5)';
        ctx.lineWidth = 1;
        ctx.textBaseline = 'middle';

        [...leftItems, ...rightItems].forEach(item => {
            ctx.beginPath();
            ctx.moveTo(item.x0, item.y0);
            ctx.lineTo(item.x1, item.y1);
            ctx.lineTo(item.x2, item.y2);
            ctx.stroke();

            ctx.textAlign = item.isRight ? 'left' : 'right';
            const xText = item.isRight ? item.x2 + 6 : item.x2 - 6;
            ctx.fillText(item.text, xText, item.y2);
        });
        ctx.restore();
    }
};

// GLOBAL CHART OPTIONS HELPERS
const OUTSIDE_BAR_LABELS = {
    anchor: 'end',
    align: 'top',
    offset: 8,
    clamp: true,
    clip: false,
    color: '#e2e8f0',
    font: { weight: '600', size: 11 },
    formatter: (v) => v
};

const TOP_RIGHT_LEGEND = {
    position: 'top',
    align: 'end',
    labels: {
        padding: 12,
        boxWidth: 12,
        usePointStyle: true,
        color: '#a0a0b0'
    }
};

// HELPER: Convert YYYY-MM-DD to ISO Start of Day
function toISOStart(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return d.toISOString();
}

// HELPER: Convert YYYY-MM-DD to ISO End of Day
function toISOEnd(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T23:59:59.999');
    return d.toISOString();
}

// Helper to format date as YYYY-MM-DD in local time
function formatDateLocal(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Charts
let dailyChart, teamChart, slaChart, handlerChart, teamSlaChart, allHandlersChart, productTypeChart, avgResChart, categoryChart;

// DOM Elements
const elements = {
    dateRange: document.getElementById('dateRange'),
    dateRangeText: document.getElementById('dateRangeText'),
    dateRangeTrigger: document.getElementById('dateRangeTrigger'),
    datePickerDropdown: document.getElementById('datePickerDropdown'),
    customDateRange: document.getElementById('customDateRange'),
    applyDates: document.getElementById('applyDates'),
    cancelDates: document.getElementById('cancelDates'),
    agentFilter: document.getElementById('agentFilter'),
    teamFilter: document.getElementById('teamFilter'),
    searchInput: document.getElementById('searchInput'),
    resetFilters: document.getElementById('resetFilters'),
    totalTickets: document.getElementById('totalTickets'),
    slaMet: document.getElementById('slaMet'),
    slaMissed: document.getElementById('slaMissed'),
    slaMetCount: document.getElementById('slaMetCount'),
    slaMissedCount: document.getElementById('slaMissedCount'),
    avgResolution: document.getElementById('avgResolution'),
    tableBody: document.getElementById('tableBody'),
    pageSize: document.getElementById('pageSize'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    exportCsv: document.getElementById('exportCsv'),
    slaNaNote: document.getElementById('slaNaNote'),
    agentSlaBody: document.getElementById('agentSlaBody'),
    slaUnitToggle: document.getElementById('slaUnitToggle')
};

// Initialize Flatpickr
let datePicker;

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    // Initialize custom date picker
    initCustomDatePicker();

    // Initialize custom searchable dropdowns
    // Static SLA options
    initSearchableDropdown('sla', ['Met', 'Missed', 'N/A'], 'All Statuses');

    // Event Listeners for searchable dropdowns
    elements.searchInput.addEventListener('input', debounce(applyFilters, 300));
    elements.resetFilters.addEventListener('click', resetFilters);

    elements.pageSize.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
    });
    elements.prevPage.addEventListener('click', () => changePage(-1));
    elements.nextPage.addEventListener('click', () => changePage(1));
    elements.exportCsv.addEventListener('click', exportToCsv);

    // Team SLA unit toggle
    if (elements.slaUnitToggle) {
        elements.slaUnitToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.slaUnitToggle.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                uiUnits.teamSla = btn.dataset.unit;
                updateTeamSlaChartOnly();
            });
        });
    }

    // Avg Res unit toggle
    const avgResToggle = document.getElementById('avgResUnitToggle');
    if (avgResToggle) {
        avgResToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                avgResToggle.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                uiUnits.avgRes = btn.dataset.unit;
                updateAvgResChartOnly();
            });
        });
    }

    // Table sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortColumn === col) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = col;
                sortDirection = 'asc';
            }
            renderTable();
        });
    });

    // Initialize charts
    initCharts();

    // See All Handlers button
    document.getElementById('seeAllHandlers').addEventListener('click', showAllHandlersModal);

    // See All Categories button
    document.getElementById('seeAllCategories').addEventListener('click', showAllCategoriesModal);

    // Daily Chart View Toggle
    const dailyChartToggle = document.getElementById('dailyChartToggle');
    if (dailyChartToggle) {
        dailyChartToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dailyChartToggle.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                uiUnits.dailyView = btn.dataset.view;
                updateDailyChartOnly();
            });
        });
    }

    // Agent SLA Unit Toggle
    const agentSlaUnitToggle = document.getElementById('agentSlaUnitToggle');
    if (agentSlaUnitToggle) {
        agentSlaUnitToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                agentSlaUnitToggle.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                uiUnits.agentSla = btn.dataset.unit;
                updateAgentTable();
            });
        });
    }

    // See All Daily Volume button
    const seeAllDailyBtn = document.getElementById('seeAllDaily');
    if (seeAllDailyBtn) {
        seeAllDailyBtn.addEventListener('click', showAllDailyModal);
    }

    // All Daily Modal View Toggle
    const allDailyViewToggle = document.getElementById('allDailyViewToggle');
    if (allDailyViewToggle) {
        allDailyViewToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                allDailyViewToggle.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderAllDailyCharts(btn.dataset.view);
            });
        });
    }

    // Clicking anywhere outside closes everything
    document.addEventListener('click', () => closeAllDropdowns(null));

    // Load data
    // Triggered by setQuickDateRange in initCustomDatePicker
    // await loadData(); 
}

// ============================================
// DATA LOADING
// ============================================

async function loadData() {
    elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">Loading data...</td></tr>';

    // Column used: created_at (Type: timestamp with time zone)
    console.log('[Fetch] starting with filters', JSON.stringify({
        from: filters.from,
        to: filters.to,
        agents: Array.from(filters.agents),
        teams: Array.from(filters.teams),
        categories: Array.from(filters.categories),
        sla: filters.sla,
        search: filters.search
    }));

    try {
        let allRecords = [];
        let page = 0;
        const queryPageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const fromIdx = page * queryPageSize;
            const toIdx = fromIdx + queryPageSize - 1;

            let query = supabaseClient
                .from('ticket_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .range(fromIdx, toIdx);

            // Apply Server-Side Filters - using 'date' column (resolved date, YYYY-MM-DD format)
            if (filters.from) {
                const fromDate = filters.from.includes('T') ? filters.from.split('T')[0] : filters.from;
                query = query.gte('date', fromDate);
            }
            if (filters.to) {
                const toDate = filters.to.includes('T') ? filters.to.split('T')[0] : filters.to;
                query = query.lte('date', toDate);
            }

            if (filters.agents.size > 0) {
                query = query.in('ticket_handler_agent_name', Array.from(filters.agents));
            }
            if (filters.teams.size > 0) {
                query = query.in('current_team', Array.from(filters.teams));
            }
            if (filters.categories.size > 0) {
                query = query.in('issue_category', Array.from(filters.categories));
            }
            if (filters.sla && filters.sla.size > 0) {
                const slaVals = Array.from(filters.sla).join(',');
                query = query.or(`ticket_sla_status.in.(${slaVals}),sla.in.(${slaVals})`);
            }

            const { data, error } = await query;

            if (error) throw error;

            allRecords = allRecords.concat(data);
            hasMore = data.length === queryPageSize;
            page++;
        }

        console.log('[Fetch] got rows:', allRecords.length);

        if (allRecords.length === 0) {
            elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">No tickets found in database.</td></tr>';
            allData = [];
            filteredData = [];
            updateDashboard();
            return;
        }

        allData = allRecords;

        // Final Client-Side Search (since fuzzy/keyword search is easier locally for small-ish sets)
        if (filters.search) {
            filteredData = allData.filter(ticket => {
                const searchFields = [
                    ticket.ticket_id,
                    ticket.description_last_ticket_note,
                    ticket.issue_category
                ].join(' ').toLowerCase();
                return searchFields.includes(filters.search.toLowerCase());
            });
        } else {
            filteredData = [...allData];
        }

        // Populate filter options (agents/teams) only on first real load or if empty
        // In a real server-side only app, these would come from separate queries
        // But for this dashboard, we derive them from the current result set
        populateFilters();

        updateDashboard();

    } catch (error) {
        console.error('[Fetch] supabase error', error);
        elements.tableBody.innerHTML = `<tr><td colspan="8" class="loading">Error: ${error.message}</td></tr>`;
    }
}

let filtersInitialized = false;

function populateFilters() {
    if (filtersInitialized) return;

    // Get unique agents, teams, and categories from master set (initial load)
    const agents = [...new Set(allData.map(t => t.ticket_handler_agent_name).filter(Boolean))].sort();
    const teams = [...new Set(allData.map(t => t.current_team).filter(Boolean))].sort();
    const categories = [...new Set(allData.map(t => t.issue_category).filter(Boolean))].sort();

    if (agents.length > 0 || teams.length > 0 || categories.length > 0) {
        initSearchableDropdown('agent', agents, 'All Agents');
        initSearchableDropdown('team', teams, 'All Teams');
        initSearchableDropdown('category', categories, 'All Categories');
        filtersInitialized = true;
    }
}

function initSearchableDropdown(type, options, placeholder) {
    const searchInput = document.getElementById(`${type}Search`);
    const optionsContainer = document.getElementById(`${type}Options`);
    const selectionSet = type === 'agent' ? selectedAgents : (type === 'team' ? selectedTeams : (type === 'sla' ? selectedSla : selectedCategories));

    // Render all options
    function renderOptions(filter = '') {
        const filtered = filter
            ? options.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
            : options;

        let html = `<div class="dropdown-option ${selectionSet.size === 0 ? 'selected' : ''}" data-value="">${placeholder}</div>`;
        html += filtered.map(o =>
            `<div class="dropdown-option ${selectionSet.has(o) ? 'selected' : ''}" data-value="${o}">
                <span class="checkbox-ui">${selectionSet.has(o) ? '✓' : ''}</span>
                ${o}
            </div>`
        ).join('');

        optionsContainer.innerHTML = html;

        // Add click handlers
        optionsContainer.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;

                if (!val) {
                    // Reset selection if "All" is clicked
                    selectionSet.clear();
                    searchInput.value = '';
                    searchInput.placeholder = placeholder;
                } else {
                    // Toggle selection
                    if (selectionSet.has(val)) {
                        selectionSet.delete(val);
                    } else {
                        selectionSet.add(val);
                    }

                    // Update display
                    if (selectionSet.size === 0) {
                        searchInput.placeholder = placeholder;
                        searchInput.value = '';
                    } else if (selectionSet.size === 1) {
                        searchInput.placeholder = [...selectionSet][0];
                        searchInput.value = '';
                    } else {
                        searchInput.placeholder = `${selectionSet.size} Selected`;
                        searchInput.value = '';
                    }
                }

                renderOptions(searchInput.value);
                updateFilterUI();
                applyFilters();
            });
        });
    }

    // Register wrapper
    const wrapperEl = document.getElementById(`${type}Dropdown`);
    if (wrapperEl) dropdownRegistry.add(wrapperEl);

    // Show dropdown on focus/click
    searchInput.addEventListener('focus', (e) => {
        e.stopPropagation();
        closeAllDropdowns(wrapperEl);
        renderOptions(searchInput.value);
        wrapperEl.classList.add('open');
    });

    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns(wrapperEl);
        renderOptions(searchInput.value);
        wrapperEl.classList.add('open');
    });

    // Filter on input
    searchInput.addEventListener('input', () => {
        renderOptions(searchInput.value);
        wrapperEl.classList.add('open');
    });

    // Clicking inside dropdown shouldn’t bubble and close it
    optionsContainer.addEventListener('click', (e) => e.stopPropagation());

    // Initial render
    renderOptions();
    updateFilterUI();
}

function updateFilterUI() {
    // 1. Searchable dropdowns (Agent, Team, Category, SLA)
    ['agent', 'team', 'category', 'sla'].forEach(type => {
        const input = document.getElementById(`${type}Search`);
        const selectionSet = (type === 'agent') ? selectedAgents :
            (type === 'team') ? selectedTeams :
                (type === 'sla') ? selectedSla : selectedCategories;
        if (input) {
            if (selectionSet.size > 0) {
                input.classList.add('filter-active');
            } else {
                input.classList.remove('filter-active');
            }
        }
    });

    // 2. Search Input
    if (elements.searchInput) {
        if (elements.searchInput.value) {
            elements.searchInput.classList.add('filter-active');
        } else {
            elements.searchInput.classList.remove('filter-active');
        }
    }
}

// ============================================
// FILTERING
// ============================================

function applyFilters() {
    // Sync UI to global filter state
    filters.search = elements.searchInput.value;

    updateFilterUI();
    currentPage = 1;
    loadData();
}

function resetFilters() {
    // Reset selection sets
    filters.agents.clear();
    filters.teams.clear();
    filters.categories.clear();
    filters.sla.clear();

    // Reset DOM inputs
    ['agent', 'team', 'category', 'sla'].forEach(type => {
        const input = document.getElementById(`${type}Search`);
        if (input) {
            input.value = '';
            input.placeholder = (type === 'sla') ? 'All Statuses' :
                (type === 'agent') ? 'Search agents...' :
                    (type === 'category') ? 'Search categories...' : `Search ${type}s...`;
        }
    });

    elements.searchInput.value = '';

    updateFilterUI();

    // Reset date picker to default (All time)
    setQuickDateRange('all');
}

/**
 * SECURITY NOTE: 
 * The Supabase key used here is currently the 'service_role' key.
 * This should NEVER be exposed in the frontend as it bypasses Row Level Security (RLS).
 * Recommended: 
 * 1. Use the 'anon' key and enable RLS in Supabase.
 * 2. Or proxy requests through a secure Backend/Edge function.
 */

function setQuickDateRange(range) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let start = new Date();
    start.setHours(0, 0, 0, 0);

    let label = '';
    switch (range) {
        case 'all':
            label = 'All time';
            filters.from = null;
            filters.to = null;
            elements.dateRange.value = '';
            elements.dateRangeText.textContent = label;

            document.querySelectorAll('.picker-opt').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.range === 'all');
            });

            loadData();
            return;
        case 'today':
            label = 'Today';
            break;
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            today.setDate(today.getDate() - 1);
            today.setHours(23, 59, 59, 999);
            label = 'Yesterday';
            break;
        case '7days':
            start.setDate(start.getDate() - 6);
            label = 'Last 7 Days';
            break;
        case '30days':
            start.setDate(start.getDate() - 29);
            label = 'Last 30 Days';
            break;
        case '90days':
            start.setDate(start.getDate() - 89);
            label = 'Last 90 Days';
            break;
        case 'month':
            start.setDate(1);
            label = 'This Month';
            break;
    }

    if (range !== 'custom') {
        const startStr = formatDateLocal(start);
        const endStr = formatDateLocal(today);

        // Store dates as YYYY-MM-DD strings directly (avoid timezone conversion issues)
        filters.from = startStr;
        filters.to = endStr;

        elements.dateRange.value = startStr === endStr ? startStr : `${startStr} to ${endStr}`;
        elements.dateRangeText.textContent = label;

        // Update range picker for consistency
        if (window.rangePicker) {
            window.rangePicker.setDate([start, today]);
        }

        // Update active class in sidebar
        document.querySelectorAll('.picker-opt').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.range === range);
        });

        loadData();
    }
}

function initCustomDatePicker() {
    const dateRangeInput = document.getElementById('customDateRange');

    // Initialize Flatpickr in range mode with inline calendar
    let rangePicker = flatpickr(dateRangeInput, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        inline: true,
        theme: 'dark',
        appendTo: document.querySelector('.picker-main'),
        static: true,
        onChange: function (selectedDates, dateStr) {
            if (selectedDates.length === 2) {
                dateRangeInput.value = dateStr;
            }
        }
    });

    // Store reference for setQuickDateRange
    window.rangePicker = rangePicker;

    // Toggle dropdown
    elements.dateRangeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.datePickerDropdown.classList.toggle('active');
    });

    // Close on click outside (but not on flatpickr elements)
    document.addEventListener('click', (e) => {
        const isInsidePicker = e.target.closest('#datePickerCustom') || e.target.closest('.flatpickr-calendar');
        if (!isInsidePicker) {
            elements.datePickerDropdown.classList.remove('active');
        }
    });

    // Apply button click
    document.getElementById('applyDates').addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedDates = rangePicker.selectedDates;

        if (selectedDates.length === 2) {
            const fromDate = formatDateLocal(selectedDates[0]);
            const toDate = formatDateLocal(selectedDates[1]);

            // Store dates as YYYY-MM-DD strings directly (avoid timezone conversion issues)
            filters.from = fromDate;
            filters.to = toDate;
            console.log('[DateFilter] committed', filters.from, filters.to);

            elements.dateRange.value = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
            elements.dateRangeText.textContent = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;

            // Mark "Custom" as active
            document.querySelectorAll('.picker-opt').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.range === 'custom');
            });

            loadData();
            elements.datePickerDropdown.classList.remove('active');
        }
    });

    // Sidebar options
    document.querySelectorAll('.picker-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            const range = opt.dataset.range;
            if (range === 'custom') {
                document.querySelectorAll('.picker-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                return; // Wait for Apply button
            }
            setQuickDateRange(range);
            elements.datePickerDropdown.classList.remove('active');
        });
    });

    // Cancel button
    elements.cancelDates.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.datePickerDropdown.classList.remove('active');
    });

    // Set initial default (All time)
    setQuickDateRange('all');
}

// ============================================
// DASHBOARD UPDATE
// ============================================

function updateDashboard() {
    updateMetrics();
    updateCharts();
    renderTable();
}

function updateMetrics() {
    const stats = calculateSlaStats(filteredData);

    elements.totalTickets.textContent = stats.total.toLocaleString();

    // SLA percentages with ticket counts
    elements.slaMet.textContent = stats.total > 0 ? `${Math.round(stats.metPct)}%` : '-';
    // Missed % is Missed / Total
    const missedPct = stats.total ? (stats.missed / stats.total) * 100 : 0;
    elements.slaMissed.textContent = stats.total > 0 ? `${Math.round(missedPct)}%` : '-';

    // SLA ticket counts
    if (elements.slaMetCount) elements.slaMetCount.textContent = `(${stats.met})`;
    if (elements.slaMissedCount) elements.slaMissedCount.textContent = `(${stats.missed})`;

    // Average resolution time
    const avgRes = calculateAverageResolution();
    elements.avgResolution.textContent = avgRes || '-';
}

function calculateAverageResolution() {
    const ticketsWithTime = filteredData.filter(t => t.resolution_time);
    if (ticketsWithTime.length === 0) return null;

    let totalMinutes = 0;
    ticketsWithTime.forEach(t => {
        totalMinutes += parseResolutionTime(t.resolution_time);
    });

    const avgMinutes = totalMinutes / ticketsWithTime.length;
    return formatMinutes(avgMinutes);
}

function parseResolutionTime(timeStr) {
    if (!timeStr) return 0;
    let minutes = 0;
    const days = timeStr.match(/(\d+)d/);
    const hours = timeStr.match(/(\d+)h/);
    const mins = timeStr.match(/(\d+)m/);
    if (days) minutes += parseInt(days[1]) * 24 * 60;
    if (hours) minutes += parseInt(hours[1]) * 60;
    if (mins) minutes += parseInt(mins[1]);
    return minutes;
}

function formatMinutes(totalMinutes) {
    if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
}

// ============================================
// CHARTS
// ============================================

function initCharts() {
    // Register the datalabels plugin
    Chart.register(ChartDataLabels);

    // Global defaults for dark theme
    Chart.defaults.color = '#ffffff';
    Chart.defaults.plugins.legend.labels.color = '#ffffff';
    Chart.defaults.font.family = 'Inter, system-ui, Arial';

    // 1. Daily Chart
    dailyChart = new Chart(document.getElementById('dailyChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            layout: { padding: { top: 20 } },
            plugins: {
                legend: { display: false },
                datalabels: OUTSIDE_BAR_LABELS
            },
            scales: {
                x: { ticks: { color: '#a0a0b0' }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });

    // 2. Team Chart (Doughnut with percent callouts)
    teamChart = new Chart(document.getElementById('teamChart'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 25, right: 35, bottom: 25, left: 35 } },
            rotation: -0.35 * Math.PI,
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                doughnutPercentCallouts: { minPct: 3, radial: 16, horiz: 28, snap: 10 }
            }
        },
        plugins: [doughnutPercentCallouts]
    });

    // 3. SLA Chart (Pie)
    slaChart = new Chart(document.getElementById('slaChart'), {
        type: 'pie',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {
            responsive: true,
            layout: { padding: { top: 18, right: 50, bottom: 18, left: 50 } },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#a0a0b0',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15
                    }
                },
                datalabels: { display: false },
                doughnutPercentCallouts: { minPct: 1, radial: 12, horiz: 20 }
            }
        },
        plugins: [doughnutPercentCallouts]
    });

    // 4. Handler Chart (Horizontal Bar)
    handlerChart = new Chart(document.getElementById('handlerChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { right: 40 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    ...OUTSIDE_BAR_LABELS,
                    align: 'right',
                    anchor: 'end'
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#a0a0b0', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });

    // 5. Team SLA Performance Chart
    teamSlaChart = new Chart(document.getElementById('teamSlaChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            layout: { padding: { top: 20 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    ...OUTSIDE_BAR_LABELS,
                    formatter: (value, ctx) => {
                        if (ctx.dataset.yAxisID === 'y') return value + '%';
                        return formatDuration(value, uiUnits.teamSla);
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'y') return `SLA: ${ctx.raw}%`;
                            return `Resolution: ${formatDuration(ctx.raw, uiUnits.teamSla)}`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#a0a0b0' }, grid: { display: false } },
                y: {
                    max: 115,
                    beginAtZero: true,
                    ticks: { color: '#a0a0b0' },
                    title: { display: true, text: 'SLA Met %', color: '#a0a0b0' }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: {
                        color: '#a0a0b0',
                        callback: (v) => formatDuration(v, uiUnits.teamSla)
                    },
                    title: { display: true, text: 'Avg Resolution Time', color: '#a0a0b0' }
                }
            }
        }
    });

    // 6. Category Chart (Bar) - HORIZONTAL
    categoryChart = new Chart(document.getElementById('categoryChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { top: 20, right: 40 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    ...OUTSIDE_BAR_LABELS,
                    align: 'right',
                    anchor: 'end'
                },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            return categoryChart.data._fullLabels ? categoryChart.data._fullLabels[idx] : items[0].label;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#a0a0b0', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });

    // 7. Product Type Distribution
    productTypeChart = new Chart(document.getElementById('productTypeChart'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 18, right: 50, bottom: 18, left: 50 } },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#a0a0b0',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15
                    }
                },
                datalabels: { display: false },
                doughnutPercentCallouts: { minPct: 1, radial: 12, horiz: 20 }
            }
        },
        plugins: [doughnutPercentCallouts]
    });

    // 8. Avg Resolution: Work vs Non-Work
    avgResChart = new Chart(document.getElementById('avgResChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, right: 40 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    ...OUTSIDE_BAR_LABELS,
                    formatter: (v) => formatDuration(v, uiUnits.avgRes)
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Resolution: ${formatDuration(ctx.raw, uiUnits.avgRes)}`
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    ticks: {
                        color: '#a0a0b0',
                        callback: (v) => formatDuration(v, uiUnits.avgRes)
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

function updateCharts() {
    // 1. Daily Volume - use separate function for toggle support
    updateDailyChartOnly();

    // 2. Team Distribution (Leader Lines)
    const teamDataMap = {};
    filteredData.forEach(t => { if (t.current_team) teamDataMap[t.current_team] = (teamDataMap[t.current_team] || 0) + 1; });
    const teamLabels = Object.keys(teamDataMap).sort((a, b) => teamDataMap[b] - teamDataMap[a]);

    teamChart._fullLabels = teamLabels; // Store for tooltip
    teamChart.data.labels = teamLabels.map(getShortTeamName);
    const teamColors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e'];
    teamChart.data.datasets = [{
        data: teamLabels.map(l => teamDataMap[l]),
        backgroundColor: teamColors
    }];
    teamChart.update();

    renderTeamDistList(teamLabels, teamLabels.map(l => teamDataMap[l]), teamColors);

    // 3. SLA Breakdown (Pie)
    const slaStats = calculateSlaStats(filteredData);
    slaChart.data.labels = ['Met', 'Missed', 'N/A'];
    slaChart.data.datasets = [{
        data: [slaStats.met, slaStats.missed, slaStats.na],
        backgroundColor: ['#22c55e', '#ef4444', '#6b7280']
    }];
    slaChart.update();

    // 4. Top 10 Handlers
    const handlerDataMap = {};
    filteredData.forEach(t => { if (t.ticket_handler_agent_name) handlerDataMap[t.ticket_handler_agent_name] = (handlerDataMap[t.ticket_handler_agent_name] || 0) + 1; });
    const sortedHandlers = Object.entries(handlerDataMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    handlerChart.data.labels = sortedHandlers.map(h => h[0]);
    handlerChart.data.datasets = [{
        data: sortedHandlers.map(h => h[1]),
        backgroundColor: 'rgba(139, 92, 246, 0.7)',
        borderColor: '#8b5cf6',
        borderWidth: 1
    }];
    const handlerMax = Math.max(...(handlerChart.data.datasets[0].data), 0);
    const handlerHeadroom = handlerMax * 0.12;
    const handlerNiceMax = Math.ceil((handlerMax + handlerHeadroom) / 10) * 10;
    handlerChart.options.scales.x.suggestedMax = handlerNiceMax || 10;
    handlerChart.update();

    // Set global data for modals
    window.allHandlersData = Object.entries(handlerDataMap).sort((a, b) => b[1] - a[1]);

    // 5. Team SLA Performance & Avg Resolution
    updateTeamSlaChartOnly();

    // 6. Category Distribution
    const catMap = {};
    filteredData.forEach(t => { const c = t.issue_category || 'Uncategorized'; catMap[c] = (catMap[c] || 0) + 1; });
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

    categoryChart.data._fullLabels = sortedCats.map(c => c[0]);
    categoryChart.data.labels = sortedCats.map(c => shortenLabel(c[0], 32));
    categoryChart.data.datasets = [{
        label: 'Tickets',
        data: sortedCats.map(c => c[1]),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: '#6366f1',
        borderWidth: 1
    }];
    const catMax = Math.max(...(categoryChart.data.datasets[0].data), 0);
    const catHeadroom = catMax * 0.12;
    const catNiceMax = Math.ceil((catMax + catHeadroom) / 10) * 10;
    categoryChart.options.scales.x.suggestedMax = catNiceMax || 10;
    categoryChart.update();

    // Set global data for modals
    window.allCategoriesData = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    // 7. Product Type Distribution
    const ptMap = {};
    filteredData.forEach(t => {
        let pt = t.product_type || '';
        const lower = pt.toLowerCase();
        if (lower.includes('cfd') || lower.includes('stellar') || lower.includes('instant')) pt = 'CFD';
        else if (lower.includes('futures')) pt = 'Futures';
        else if (!pt) return;
        ptMap[pt] = (ptMap[pt] || 0) + 1;
    });
    const ptLabels = Object.keys(ptMap).sort();
    productTypeChart.data.labels = ptLabels;
    productTypeChart.data.datasets = [{
        data: ptLabels.map(l => ptMap[l]),
        backgroundColor: ['#8b5cf6', '#06b6d4', '#6b7280']
    }];
    productTypeChart.update();

    // 8. Work vs Non-Work
    updateAvgResChartOnly();

    // Notes
    if (elements.slaNaNote) elements.slaNaNote.style.display = slaStats.na > 0 ? 'block' : 'none';

    // Agent Table update
    updateAgentTable();
}

function renderTeamDistList(labels, counts, colors) {
    const el = document.getElementById('teamDistList');
    if (!el) return;

    const total = counts.reduce((a, b) => a + (+b || 0), 0) || 1;

    const rows = labels.map((name, idx) => ({
        name,
        count: counts[idx] || 0,
        pct: ((counts[idx] || 0) / total) * 100,
        color: colors[idx] || '#999'
    })).sort((a, b) => b.count - a.count);

    el.innerHTML = rows.map(r => `
    <div class="team-dist-item">
      <div class="team-dist-left">
        <span class="team-dist-swatch" style="background:${r.color}"></span>
        <span class="team-dist-name" title="${r.name}">${r.name}</span>
      </div>
      <div class="team-dist-right">
        <span class="team-dist-count">${r.count.toLocaleString()}</span>
        <span>${r.pct.toFixed(1)}%</span>
      </div>
    </div>
  `).join('');
}

function updateAgentTable() {
    const agentSlaData = {};
    const agentTickets = {}; // Store tickets per agent for modal

    filteredData.forEach(t => {
        const a = t.ticket_handler_agent_name;
        if (!a) return;
        if (!agentSlaData[a]) {
            agentSlaData[a] = { total: 0, met: 0, missed: 0, na: 0, resSum: 0, resCount: 0 };
            agentTickets[a] = [];
        }
        agentSlaData[a].total++;
        agentTickets[a].push(t);

        // AGENT SLA PERFORMANCE: Use the agent_sla_status column directly
        const status = t.agent_sla_status;

        if (status === 'Met') {
            agentSlaData[a].met++;
        } else if (status === 'Missed') {
            agentSlaData[a].missed++;
        } else {
            agentSlaData[a].na++;
        }

        // Calculate agent handle time for average (from agent_handle_time_seconds column)
        const handleTimeSec = t.agent_handle_time_seconds;
        if (handleTimeSec && handleTimeSec > 0) {
            // Convert seconds to minutes for formatDuration
            agentSlaData[a].resSum += (handleTimeSec / 60);
            agentSlaData[a].resCount++;
        }
    });

    // Store for modal access
    window.agentTicketsData = agentTickets;

    const sortedAgents = Object.keys(agentSlaData)
        .map(name => {
            const d = agentSlaData[name];
            const totalSla = d.met + d.missed; // Percentage should be based on tickets with an actual Met/Missed status
            const pct = totalSla ? Math.round((d.met / totalSla) * 100) : 0;
            const avgResMin = d.resCount > 0 ? (d.resSum / d.resCount) : 0;
            return { name, ...d, pct, avgResMin };
        })
        .sort((a, b) => b.total - a.total) // Still sorting by volume primarily, or could sort by b.pct - a.pct
        .slice(0, 20);

    if (elements.agentSlaBody) {
        elements.agentSlaBody.innerHTML = sortedAgents.map(d => {
            const cls = d.pct >= 90 ? 'sla-good' : (d.pct >= 75 ? 'sla-warning' : 'sla-poor');
            const avgResDisplay = formatDuration(d.avgResMin, uiUnits.agentSla);
            return `<tr>
                <td>${d.name}</td>
                <td>${d.total}</td>
                <td>${d.met}</td>
                <td>${d.missed}</td>
                <td class="${cls}">${d.pct}%</td>
                <td>${avgResDisplay}</td>
                <td><button class="btn-details" onclick="showAgentDetails('${d.name.replace(/'/g, "\\'")}')">Details</button></td>
            </tr>`;
        }).join('');
    }
}

function renderTeamSlaMiniLegend() {
    const el = document.getElementById('teamSlaMiniLegend');
    if (!el) return;
    el.innerHTML = `
        <div class="item"><span class="dot" style="background:#22c55e"></span>SLA Met %</div>
        <div class="item"><span class="dot" style="background:#6366f1"></span>Avg Res (${uiUnits.teamSla})</div>
    `;
}

function updateTeamSlaChartOnly() {
    if (!teamSlaChart) return;

    const teamStats = {};
    filteredData.forEach(t => {
        const team = t.current_team;
        if (!team) return;
        if (!teamStats[team]) teamStats[team] = { met: 0, missed: 0, na: 0, resMins: [] };

        // Use ticket_sla_status
        const status = t.ticket_sla_status || t.sla;
        if (status === 'Met') teamStats[team].met++;
        else if (status === 'Missed') teamStats[team].missed++;
        else teamStats[team].na++;

        const m = parseResolutionTime(t.resolution_time);
        if (m > 0) teamStats[team].resMins.push(m);
    });

    const teamsSorted = Object.keys(teamStats).sort();
    const slaPcts = teamsSorted.map(t => {
        const s = teamStats[t];
        const total = s.met + s.missed + s.na;
        return total ? Math.round((s.met / total) * 100) : 0;
    });

    const resAvgsMin = teamsSorted.map(t => {
        const arr = teamStats[t].resMins;
        if (!arr.length) return 0;
        return (arr.reduce((a, b) => a + b, 0) / arr.length);
    });

    teamSlaChart.data.labels = teamsSorted.map(getShortTeamName);
    teamSlaChart.data.datasets = [
        { label: 'SLA Met %', data: slaPcts, backgroundColor: 'rgba(34, 197, 94, 0.7)', borderColor: '#22c55e', borderWidth: 1, yAxisID: 'y' },
        { label: `Avg Res (${uiUnits.teamSla})`, data: resAvgsMin, backgroundColor: 'rgba(99, 102, 241, 0.7)', borderColor: '#6366f1', borderWidth: 1, yAxisID: 'y1' }
    ];

    teamSlaChart.options.plugins.datalabels.formatter = (value, ctx) => {
        if (ctx.dataset.yAxisID === 'y') return value + '%';
        return formatDuration(value, uiUnits.teamSla);
    };

    teamSlaChart.options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.dataset.yAxisID === 'y') return `SLA: ${ctx.raw}%`;
        return `Resolution: ${formatDuration(ctx.raw, uiUnits.teamSla)}`;
    };

    const resMax = Math.max(...resAvgsMin, 0);
    teamSlaChart.options.scales.y1.suggestedMax = resMax * 1.2 || 10;

    renderTeamSlaMiniLegend();
    teamSlaChart.update();
}

function updateAvgResChartOnly() {
    if (!avgResChart) return;

    const wh = { sum: 0, count: 0 }, nwh = { sum: 0, count: 0 };
    filteredData.forEach(t => {
        const team = (t.current_team || "").toLowerCase();
        const is24x7 = team.includes("pro solution") || team.includes("cex reversal") || team.includes("ticket dependencies");
        const m = parseResolutionTime(t.resolution_time);
        if (m > 0) {
            if (is24x7 || t.resolved_during_office_hours === true) { wh.sum += m; wh.count++; }
            else if (t.resolved_during_office_hours === false) { nwh.sum += m; nwh.count++; }
        }
    });

    const dataMin = [
        wh.count ? (wh.sum / wh.count) : 0,
        nwh.count ? (nwh.sum / nwh.count) : 0
    ];

    avgResChart.data.labels = ['Work Hours', 'After Hours'];
    avgResChart.data.datasets = [{ data: dataMin, backgroundColor: ['#22c55e', '#6366f1'] }];

    avgResChart.options.plugins.datalabels.formatter = (v) => formatDuration(v, uiUnits.avgRes);
    avgResChart.options.plugins.tooltip.callbacks.label = (ctx) => `Resolution: ${formatDuration(ctx.raw, uiUnits.avgRes)}`;

    const avgMax = Math.max(...dataMin, 0);
    avgResChart.options.scales.y.suggestedMax = avgMax * 1.2 || 10;

    avgResChart.update();
}

function updateDailyChartOnly() {
    if (!dailyChart) return;

    const viewMode = uiUnits.dailyView; // 'day', 'week', 'month'

    // Use the globally filtered data (already filtered by selected date range)
    const chartData = filteredData.filter(t => t.date);

    let labels = [];
    let data = [];
    let fullDates = []; // Store full dates for tooltip

    if (viewMode === 'day') {
        // Group by day
        const dailyData = {};
        chartData.forEach(t => {
            if (t.date) dailyData[t.date] = (dailyData[t.date] || 0) + 1;
        });

        const allSortedDates = Object.keys(dailyData).sort();

        // Limit to last 30 days within the selected range
        const sortedDates = allSortedDates.slice(-30);

        // Store full data for modal
        window.dailyChartFullData = {
            allDates: allSortedDates,
            dailyData: dailyData
        };

        // Track previous month for boundary detection (no year shown on main chart)
        let prevMonth = null;

        // Create smart labels: day number, with month when month changes
        labels = sortedDates.map((dateStr, idx) => {
            const d = new Date(dateStr + 'T00:00:00');
            const day = d.getDate();
            const monthNum = d.getMonth();
            const month = d.toLocaleString('default', { month: 'short' });

            let label = '';

            // Show month when it's the first entry OR month changes
            if (idx === 0 || (prevMonth !== null && monthNum !== prevMonth)) {
                label = `${month} ${day}`;
            }
            else {
                label = day.toString();
            }

            prevMonth = monthNum;
            return label;
        });

        data = sortedDates.map(d => dailyData[d]);
        fullDates = sortedDates; // Store for tooltip

    } else if (viewMode === 'week') {
        // Group by week
        const weeklyData = {};
        const weekRanges = {}; // Store week date ranges for tooltip
        chartData.forEach(t => {
            if (!t.date) return;
            const d = new Date(t.date + 'T00:00:00');
            // Get ISO week start (Monday)
            const dayOfWeek = d.getDay();
            const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const weekStart = new Date(d);
            weekStart.setDate(diff);
            const weekKey = formatDateLocal(weekStart);
            weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;

            // Calculate week end (Sunday)
            if (!weekRanges[weekKey]) {
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weekRanges[weekKey] = {
                    start: weekStart,
                    end: weekEnd
                };
            }
        });

        const allSortedWeeks = Object.keys(weeklyData).sort();
        const sortedWeeks = allSortedWeeks.slice(-30); // Last 30 weeks for chart

        // Store full data for modal
        window.dailyChartFullData = {
            allWeeks: allSortedWeeks,
            weeklyData: weeklyData,
            weekRanges: weekRanges
        };

        labels = sortedWeeks.map(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const month = d.toLocaleString('default', { month: 'short' });
            const day = d.getDate();
            const year = d.getFullYear();
            // Show year for January weeks
            if (d.getMonth() === 0 && day <= 7) {
                return `${year}\n${month} ${day}`;
            }
            return `${month} ${day}`;
        });

        data = sortedWeeks.map(w => weeklyData[w]);

        // Store week ranges for tooltip access
        dailyChart._weekRanges = sortedWeeks.map(weekKey => weekRanges[weekKey]);
        fullDates = sortedWeeks;

    } else {
        // Group by month (default)
        const monthlyData = {};
        chartData.forEach(t => {
            if (!t.date) return;
            const d = new Date(t.date + 'T00:00:00');
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        });

        const allSortedMonths = Object.keys(monthlyData).sort();
        const sortedMonths = allSortedMonths.slice(-12); // Last 12 months for chart

        // Store full data for modal
        window.dailyChartFullData = {
            allMonths: allSortedMonths,
            monthlyData: monthlyData
        };

        labels = sortedMonths.map(monthKey => {
            const [year, month] = monthKey.split('-');
            const d = new Date(parseInt(year), parseInt(month) - 1, 1);
            return d.toLocaleString('default', { month: 'short', year: 'numeric' });
        });

        data = sortedMonths.map(m => monthlyData[m]);
        fullDates = sortedMonths;

        // Clear week ranges for non-week views
        dailyChart._weekRanges = null;
    }

    // Store full dates for tooltip
    dailyChart._fullDates = fullDates;

    dailyChart.data.labels = labels;
    dailyChart.data.datasets = [{
        label: 'Tickets',
        data: data,
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: '#6366f1',
        borderWidth: 1
    }];

    // Update tooltip to show full date
    dailyChart.options.plugins.tooltip = {
        callbacks: {
            title: (items) => {
                const idx = items[0].dataIndex;

                if (uiUnits.dailyView === 'week' && dailyChart._weekRanges) {
                    const range = dailyChart._weekRanges[idx];
                    if (range) {
                        const startStr = range.start.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' });
                        const endStr = range.end.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' });
                        return `${startStr} - ${endStr}`;
                    }
                } else if (uiUnits.dailyView === 'day' && dailyChart._fullDates) {
                    const dateStr = dailyChart._fullDates[idx];
                    if (dateStr) {
                        const d = new Date(dateStr + 'T00:00:00');
                        return d.toLocaleString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                    }
                }
                return items[0].label;
            },
            label: (ctx) => {
                return `Tickets: ${ctx.raw}`;
            }
        }
    };

    const dailyMax = Math.max(...data, 0);
    dailyChart.options.scales.y.suggestedMax = Math.ceil(dailyMax * 1.30) || 10;
    dailyChart.update();
}

// ============================================
// TABLE
// ============================================

function renderTable() {
    // Sort data
    const sorted = [...filteredData].sort((a, b) => {
        let aVal = a[sortColumn] || '';
        let bVal = b[sortColumn] || '';
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        }
        return aVal < bVal ? 1 : -1;
    });

    // Paginate
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = sorted.slice(start, end);

    // Render
    if (pageData.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="7" class="loading">No tickets found</td></tr>';
    } else {
        elements.tableBody.innerHTML = pageData.map((ticket, index) => {
            const displaySla = ticket.ticket_sla_status || ticket.sla || '-';
            const slaClass = displaySla !== '-' ? displaySla.toLowerCase() : 'na';

            const ticketIdDisplay = ticket.intercom_id
                ? `<a href="https://app.intercom.com/a/inbox/aphmhtyj/inbox/conversation/${ticket.intercom_id}?view=List" target="_blank" class="ticket-id-link" onclick="event.stopPropagation()">${ticket.ticket_id || '-'}</a>`
                : (ticket.ticket_id || '-');

            return `
            <tr class="clickable-row" data-index="${start + index}">
                <td>${ticket.date || '-'}</td>
                <td>${ticketIdDisplay}</td>
                <td>${ticket.ticket_handler_agent_name || '-'}</td>
                <td>${ticket.current_team || '-'}</td>
                <td>${ticket.resolution_time || '-'}</td>
                <td><span class="sla-badge sla-${slaClass}">${displaySla}</span></td>
                <td>${ticket.issue_category || '-'}</td>
            </tr>
        `;
        }).join('');

        // Add click handlers to rows
        elements.tableBody.querySelectorAll('.clickable-row').forEach((row, idx) => {
            row.addEventListener('click', () => {
                showTicketDetails(pageData[idx]);
            });
        });
    }

    // Update pagination
    const totalPages = Math.ceil(sorted.length / pageSize);
    elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${sorted.length} tickets)`;
    elements.prevPage.disabled = currentPage === 1;
    elements.nextPage.disabled = currentPage >= totalPages;
}

function changePage(delta) {
    currentPage += delta;
    renderTable();
}

function truncate(str, len) {
    if (!str) return '-';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

// ============================================
// EXPORT
// ============================================

function exportToCsv() {
    const headers = ['Date', 'Ticket ID', 'Handler', 'Team', 'Resolution Time', 'SLA', 'Category', 'Description'];
    const rows = filteredData.map(t => [
        t.date,
        t.ticket_id,
        t.ticket_handler_agent_name,
        t.current_team,
        t.resolution_time,
        t.ticket_sla_status || t.sla,
        t.issue_category,
        `"${(t.description_last_ticket_note || "").replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// UTILITIES
// ============================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ============================================
// MODAL FUNCTIONS
// ============================================

// Field labels for display
const fieldLabels = {
    date: 'Date',
    ticket_id: 'Ticket ID',
    ticket_handler_agent_name: 'Handler',
    current_team: 'Team',
    resolution_time: 'Resolution Time',
    ticket_sla_status: 'Ticket SLA Status',
    agent_sla_status: 'Agent SLA Status',
    issue_category: 'Issue Category',
    description_last_ticket_note: 'Description'
};

function showTicketDetails(ticket) {
    const modal = document.getElementById('ticketModal');
    const modalBody = document.getElementById('modalBody');

    // Order of fields to display
    const fieldOrder = [
        'ticket_id',
        'date',
        'ticket_handler_agent_name',
        'current_team',
        'resolution_time',
        'ticket_sla_status',
        'agent_sla_status',
        'issue_category',
        'description_last_ticket_note'
    ];

    // Build the detail view
    let html = '';

    fieldOrder.forEach(field => {
        const value = ticket[field];
        const label = fieldLabels[field] || field;

        if (value !== null && value !== undefined && value !== '') {
            let displayValue = value;
            let valueClass = 'detail-value';

            // Special formatting for SLA
            if (field === 'sla' || field === 'ticket_sla_status' || field === 'agent_sla_status') {
                valueClass += value === 'Met' ? ' sla-met' : (value === 'Missed' ? ' sla-missed' : '');
            }

            html += `
                <div class="detail-item">
                    <div class="detail-label">${label}</div>
                    <div class="${valueClass}">${displayValue}</div>
                </div>
            `;
        }
    });

    // Add any additional fields not in the order list, except excluded technical fields
    const excludedFields = ['forwarded_to', 'created_at', 'updated_at', 'id', 'unique_id'];

    Object.keys(ticket).forEach(field => {
        if (!fieldOrder.includes(field) && !excludedFields.includes(field) && ticket[field] !== null && ticket[field] !== undefined && ticket[field] !== '') {
            const label = fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            html += `
                <div class="detail-item">
                    <div class="detail-label">${label}</div>
                    <div class="detail-value">${ticket[field]}</div>
                </div>
            `;
        }
    });

    modalBody.innerHTML = html;
    modal.classList.add('active');

    // Close on escape key
    document.addEventListener('keydown', handleEscapeKey);

    // Close when clicking outside modal content
    modal.addEventListener('click', handleOutsideClick);
}

function closeModal() {
    const modal = document.getElementById('ticketModal');
    modal.classList.remove('active');
    document.removeEventListener('keydown', handleEscapeKey);
    modal.removeEventListener('click', handleOutsideClick);
}

function handleEscapeKey(e) {
    if (e.key === 'Escape') closeModal();
}

function handleOutsideClick(e) {
    if (e.target.classList.contains('modal')) closeModal();
}

// ============================================
// ALL DAILY VOLUME MODAL
// ============================================

let allDailyCharts = []; // Store chart instances for cleanup

function showAllDailyModal() {
    const modal = document.getElementById('allDailyModal');
    modal.classList.add('active');

    // Reset view toggle to match current main chart view
    const toggle = document.getElementById('allDailyViewToggle');
    if (toggle) {
        toggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === uiUnits.dailyView);
        });
    }

    renderAllDailyCharts(uiUnits.dailyView);

    // Add event listeners
    document.addEventListener('keydown', handleAllDailyEscapeKey);
    modal.addEventListener('click', handleAllDailyOutsideClick);
}

function closeAllDailyModal() {
    const modal = document.getElementById('allDailyModal');
    modal.classList.remove('active');

    // Cleanup charts
    allDailyCharts.forEach(chart => chart.destroy());
    allDailyCharts = [];

    document.removeEventListener('keydown', handleAllDailyEscapeKey);
    modal.removeEventListener('click', handleAllDailyOutsideClick);
}

function handleAllDailyEscapeKey(e) {
    if (e.key === 'Escape') closeAllDailyModal();
}

function handleAllDailyOutsideClick(e) {
    if (e.target.classList.contains('modal')) closeAllDailyModal();
}

function renderAllDailyCharts(viewMode) {
    const body = document.getElementById('allDailyBody');
    const data = window.dailyChartFullData;

    if (!data) {
        body.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No data available. Please select a date range first.</p>';
        return;
    }

    // Cleanup old charts
    allDailyCharts.forEach(chart => chart.destroy());
    allDailyCharts = [];

    const BARS_PER_ROW = 60; // Max bars per chart row

    let allKeys = [];
    let dataMap = {};
    let weekRanges = {};

    if (viewMode === 'day' && data.allDates) {
        allKeys = data.allDates;
        dataMap = data.dailyData;
    } else if (viewMode === 'week' && data.allWeeks) {
        allKeys = data.allWeeks;
        dataMap = data.weeklyData;
        weekRanges = data.weekRanges || {};
    } else if (viewMode === 'month' && data.allMonths) {
        allKeys = data.allMonths;
        dataMap = data.monthlyData;
    } else {
        // Fallback - recalculate from filteredData
        const chartData = filteredData.filter(t => t.date);

        if (viewMode === 'day') {
            chartData.forEach(t => {
                if (t.date) dataMap[t.date] = (dataMap[t.date] || 0) + 1;
            });
            allKeys = Object.keys(dataMap).sort();
        } else if (viewMode === 'week') {
            chartData.forEach(t => {
                if (!t.date) return;
                const d = new Date(t.date + 'T00:00:00');
                const dayOfWeek = d.getDay();
                const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                const weekStart = new Date(d);
                weekStart.setDate(diff);
                const weekKey = formatDateLocal(weekStart);
                dataMap[weekKey] = (dataMap[weekKey] || 0) + 1;
            });
            allKeys = Object.keys(dataMap).sort();
        } else {
            chartData.forEach(t => {
                if (!t.date) return;
                const d = new Date(t.date + 'T00:00:00');
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                dataMap[monthKey] = (dataMap[monthKey] || 0) + 1;
            });
            allKeys = Object.keys(dataMap).sort();
        }
    }

    if (allKeys.length === 0) {
        body.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No data available for this view.</p>';
        return;
    }

    // Calculate total tickets
    const totalTickets = allKeys.reduce((sum, key) => sum + (dataMap[key] || 0), 0);
    const avgPerPeriod = Math.round(totalTickets / allKeys.length);

    // Split into rows
    const rows = [];
    for (let i = 0; i < allKeys.length; i += BARS_PER_ROW) {
        rows.push(allKeys.slice(i, i + BARS_PER_ROW));
    }

    // Build HTML
    let html = `
        <div class="all-daily-stats">
            <div class="all-daily-stat">
                <span class="stat-label">Total ${viewMode === 'day' ? 'Days' : viewMode === 'week' ? 'Weeks' : 'Months'}</span>
                <span class="stat-value">${allKeys.length}</span>
            </div>
            <div class="all-daily-stat">
                <span class="stat-label">Total Tickets</span>
                <span class="stat-value">${totalTickets.toLocaleString()}</span>
            </div>
            <div class="all-daily-stat">
                <span class="stat-label">Avg per ${viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'}</span>
                <span class="stat-value">${avgPerPeriod}</span>
            </div>
        </div>
        <div class="daily-chart-rows">
    `;

    rows.forEach((rowKeys, rowIdx) => {
        const startKey = rowKeys[0];
        const endKey = rowKeys[rowKeys.length - 1];
        let rangeLabel = '';

        if (viewMode === 'day') {
            const startDate = new Date(startKey + 'T00:00:00');
            const endDate = new Date(endKey + 'T00:00:00');
            rangeLabel = `${startDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        } else if (viewMode === 'week') {
            rangeLabel = `Weeks: ${startKey} to ${endKey}`;
        } else {
            rangeLabel = `Months: ${startKey} to ${endKey}`;
        }

        html += `
            <div class="daily-chart-row">
                <h4>${rangeLabel}</h4>
                <canvas id="allDailyChart_${rowIdx}"></canvas>
            </div>
        `;
    });

    html += '</div>';
    body.innerHTML = html;

    // Create charts for each row
    rows.forEach((rowKeys, rowIdx) => {
        const ctx = document.getElementById(`allDailyChart_${rowIdx}`);
        if (!ctx) return;

        let prevYear = null;
        let prevMonth = null;
        const labels = rowKeys.map((key, idx) => {
            if (viewMode === 'day') {
                const d = new Date(key + 'T00:00:00');
                const day = d.getDate();
                const monthNum = d.getMonth();
                const month = d.toLocaleString('default', { month: 'short' });
                const year = d.getFullYear();

                let label = '';

                // Show year when year changes
                if (prevYear !== null && year !== prevYear) {
                    label = `${year}\n${month} ${day}`;
                }
                // Show month when it's the first entry OR month changes
                else if (idx === 0 || (prevMonth !== null && monthNum !== prevMonth)) {
                    // Also show year if it's January (first month of year)
                    if (monthNum === 0 && (idx === 0 || prevMonth !== 0)) {
                        label = `${year}\n${month} ${day}`;
                    } else {
                        label = `${month} ${day}`;
                    }
                }
                else {
                    label = day.toString();
                }

                prevYear = year;
                prevMonth = monthNum;
                return label;
            } else if (viewMode === 'week') {
                const d = new Date(key + 'T00:00:00');
                const month = d.toLocaleString('default', { month: 'short' });
                const day = d.getDate();
                return `${month} ${day}`;
            } else {
                const [year, month] = key.split('-');
                const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                return d.toLocaleString('default', { month: 'short', year: '2-digit' });
            }
        });

        const chartData = rowKeys.map(key => dataMap[key] || 0);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Tickets',
                    data: chartData,
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: '#6366f1',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 20 } },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'end',
                        color: '#ffffff',
                        font: { size: 9, weight: 'bold' },
                        formatter: (value) => value > 0 ? value : ''
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                const key = rowKeys[idx];

                                if (viewMode === 'day') {
                                    const d = new Date(key + 'T00:00:00');
                                    return d.toLocaleString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                                } else if (viewMode === 'week') {
                                    return `Week of ${key}`;
                                } else {
                                    const [year, month] = key.split('-');
                                    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                                    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
                                }
                            },
                            label: (ctx) => `Tickets: ${ctx.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#a0a0b0',
                            font: { size: 9 },
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#a0a0b0' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });

        allDailyCharts.push(chart);
    });
}

// ============================================
// ALL HANDLERS MODAL (Paginated Table)
// ============================================

let handlersCurrentPage = 1;
const HANDLERS_PER_PAGE = 15;

function showAllHandlersModal() {
    const modal = document.getElementById('handlersModal');
    modal.classList.add('active');

    handlersCurrentPage = 1;
    renderHandlersPage();

    // Event listeners for pagination
    document.getElementById('handlersPrev').onclick = () => {
        if (handlersCurrentPage > 1) {
            handlersCurrentPage--;
            renderHandlersPage();
        }
    };

    document.getElementById('handlersNext').onclick = () => {
        const allHandlers = window.allHandlersData || [];
        const totalPages = Math.ceil(allHandlers.length / HANDLERS_PER_PAGE);
        if (handlersCurrentPage < totalPages) {
            handlersCurrentPage++;
            renderHandlersPage();
        }
    };

    // Add event listeners
    document.addEventListener('keydown', handleHandlersEscapeKey);
    modal.addEventListener('click', handleHandlersOutsideClick);
}

function renderHandlersPage() {
    const allHandlers = window.allHandlersData || [];
    const totalPages = Math.ceil(allHandlers.length / HANDLERS_PER_PAGE);
    const maxCount = allHandlers.length > 0 ? allHandlers[0][1] : 1;

    const start = (handlersCurrentPage - 1) * HANDLERS_PER_PAGE;
    const end = start + HANDLERS_PER_PAGE;
    const pageHandlers = allHandlers.slice(start, end);

    // Update page info
    document.getElementById('handlersPageInfo').textContent = `Page ${handlersCurrentPage} of ${totalPages}`;

    // Update button states
    document.getElementById('handlersPrev').disabled = handlersCurrentPage === 1;
    document.getElementById('handlersNext').disabled = handlersCurrentPage === totalPages;

    // Render handlers
    const container = document.getElementById('handlersTableContainer');
    container.innerHTML = pageHandlers.map((handler, idx) => {
        const rank = start + idx + 1;
        const name = handler[0];
        const count = handler[1];
        const percentage = (count / maxCount) * 100;

        return `
            <div class="handler-row">
                <span class="handler-rank">#${rank}</span>
                <span class="handler-name">${name}</span>
                <div class="handler-bar-container">
                    <div class="handler-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="handler-count">${count}</span>
            </div>
        `;
    }).join('');
}

function closeHandlersModal() {
    const modal = document.getElementById('handlersModal');
    modal.classList.remove('active');
    document.removeEventListener('keydown', handleHandlersEscapeKey);
    modal.removeEventListener('click', handleHandlersOutsideClick);
}

function handleHandlersEscapeKey(e) {
    if (e.key === 'Escape') closeHandlersModal();
}

function handleHandlersOutsideClick(e) {
    if (e.target.classList.contains('modal')) closeHandlersModal();
}

// ============================================
// ALL CATEGORIES MODAL
// ============================================

let allCategoriesData = [];
let categoriesPageNum = 1;
const categoriesPageSize = 15;

function showAllCategoriesModal() {
    const modal = document.getElementById('categoriesModal');

    // Build category data from filteredData
    const categoryCounts = {};
    filteredData.forEach(t => {
        const cat = t.issue_category || 'Uncategorized';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    allCategoriesData = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    categoriesPageNum = 1;
    renderCategoriesPage();

    modal.classList.add('active');

    // Event listeners for pagination
    document.getElementById('categoriesPrev').onclick = () => {
        if (categoriesPageNum > 1) {
            categoriesPageNum--;
            renderCategoriesPage();
        }
    };
    document.getElementById('categoriesNext').onclick = () => {
        const totalPages = Math.ceil(allCategoriesData.length / categoriesPageSize);
        if (categoriesPageNum < totalPages) {
            categoriesPageNum++;
            renderCategoriesPage();
        }
    };

    document.addEventListener('keydown', handleCategoriesEscapeKey);
    modal.addEventListener('click', handleCategoriesOutsideClick);
}

function renderCategoriesPage() {
    const totalPages = Math.max(1, Math.ceil(allCategoriesData.length / categoriesPageSize));
    document.getElementById('categoriesPageInfo').textContent = `Page ${categoriesPageNum} of ${totalPages}`;

    const start = (categoriesPageNum - 1) * categoriesPageSize;
    const end = start + categoriesPageSize;
    const pageCategories = allCategoriesData.slice(start, end);

    const maxCount = allCategoriesData.length > 0 ? allCategoriesData[0][1] : 1;

    const container = document.getElementById('categoriesTableContainer');
    container.innerHTML = pageCategories.map((cat, idx) => {
        const rank = start + idx + 1;
        const name = cat[0];
        const count = cat[1];
        const percentage = (count / maxCount) * 100;

        return `
            <div class="handler-row">
                <span class="handler-rank">#${rank}</span>
                <span class="handler-name" title="${name}">${name}</span>
                <div class="handler-bar-container">
                    <div class="handler-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="handler-count">${count}</span>
            </div>
        `;
    }).join('');
}

function closeCategoriesModal() {
    const modal = document.getElementById('categoriesModal');
    modal.classList.remove('active');
    document.removeEventListener('keydown', handleCategoriesEscapeKey);
    modal.removeEventListener('click', handleCategoriesOutsideClick);
}

function handleCategoriesEscapeKey(e) {
    if (e.key === 'Escape') closeCategoriesModal();
}

function handleCategoriesOutsideClick(e) {
    if (e.target.classList.contains('modal')) closeCategoriesModal();
}

// ============================================
// AGENT DETAIL MODAL
// ============================================

function showAgentDetails(agentName) {
    const modal = document.getElementById('agentDetailModal');
    const title = document.getElementById('agentDetailTitle');
    const body = document.getElementById('agentDetailBody');

    title.textContent = `Tickets for ${agentName}`;

    const tickets = window.agentTicketsData ? window.agentTicketsData[agentName] || [] : [];

    // Separate tickets by SLA status
    const metTickets = tickets.filter(t => t.agent_sla_status === 'Met');
    const missedTickets = tickets.filter(t => t.agent_sla_status === 'Missed');

    // Group tickets by date
    function groupByDate(ticketList) {
        const grouped = {};
        ticketList.forEach(t => {
            const date = t.date || 'Unknown';
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(t);
        });
        // Sort by date descending
        const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
        return sortedDates.map(date => ({ date, tickets: grouped[date] }));
    }

    function renderTicketLink(t) {
        const ticketId = t.ticket_id || '-';
        if (t.intercom_id) {
            return `<a href="https://app.intercom.com/a/inbox/aphmhtyj/inbox/conversation/${t.intercom_id}?view=List" target="_blank" class="ticket-id-link">${ticketId}</a>`;
        }
        return `<span class="ticket-id-plain">${ticketId}</span>`;
    }

    function renderSection(sectionTitle, sectionTickets, slaClass) {
        if (sectionTickets.length === 0) {
            return `<div class="agent-detail-section">
                <h4 class="section-title ${slaClass}">${sectionTitle} (0)</h4>
                <div class="section-scroll-area">
                    <p class="no-tickets">No tickets</p>
                </div>
            </div>`;
        }

        const grouped = groupByDate(sectionTickets);
        let html = `<div class="agent-detail-section">
            <h4 class="section-title ${slaClass}">${sectionTitle} (${sectionTickets.length})</h4>
            <div class="section-scroll-area">`;

        grouped.forEach(({ date, tickets: dateTickets }) => {
            html += `<div class="date-group">
                <div class="date-header">${date}</div>
                <div class="ticket-chips">
                    ${dateTickets.map(t => renderTicketLink(t)).join('')}
                </div>
            </div>`;
        });

        html += '</div></div>';
        return html;
    }

    body.innerHTML = `
        <div class="agent-detail-columns">
            ${renderSection('✓ SLA Met', metTickets, 'sla-met-section')}
            ${renderSection('✗ SLA Missed', missedTickets, 'sla-missed-section')}
        </div>
    `;

    // Reset scroll position to top
    body.scrollTop = 0;
    const scrollAreas = body.querySelectorAll('.section-scroll-area');
    scrollAreas.forEach(area => area.scrollTop = 0);

    modal.classList.add('active');

    // Add event listeners
    document.addEventListener('keydown', handleAgentDetailEscapeKey);
    modal.addEventListener('click', handleAgentDetailOutsideClick);
}

function closeAgentDetailModal() {
    const modal = document.getElementById('agentDetailModal');
    modal.classList.remove('active');
    document.removeEventListener('keydown', handleAgentDetailEscapeKey);
    modal.removeEventListener('click', handleAgentDetailOutsideClick);
}

function handleAgentDetailEscapeKey(e) {
    if (e.key === 'Escape') closeAgentDetailModal();
}

function handleAgentDetailOutsideClick(e) {
    if (e.target.classList.contains('modal')) closeAgentDetailModal();
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', init);
