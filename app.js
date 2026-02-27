/* ============================================
   TICKET ANALYTICS DASHBOARD - APP.JS
   Supabase connection, filtering, charts
============================================ */

// Supabase Configuration
const SUPABASE_URL = 'https://umkzssfympyhifdjptwf.supabase.co';
// Using public anon key for secure client-side read access
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3pzc2Z5bXB5aGlmZGpwdHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NTM5MzMsImV4cCI6MjA4MzUyOTkzM30.yACHrTSkAwiDrALjn_11YS9nQ0R8OnFyDbPOY3nkzAA';

// Create client with a different variable name to avoid conflict with CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('✅ Supabase client initialized');

// State
let allData = [];
let filteredData = [];
let aggregates = null;  // Pre-aggregated data from Supabase RPC
let tableTotal = 0;     // Total rows for server-side pagination
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

let dailyChart, teamChart, slaChart, handlerChart, teamSlaChart, allHandlersChart, productTypeChart, avgResChart, categoryChart, countryChart;
let continentMapInstance = null;
let continentCurrentData = {};

// Continent → ISO 3166-1 alpha-2 country codes
const CONTINENT_COUNTRIES = {
    'Asia': ['AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'CY', 'GE', 'IN', 'ID', 'IR', 'IQ', 'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MY', 'MV', 'MN', 'MM', 'NP', 'KP', 'OM', 'PK', 'PS', 'PH', 'QA', 'SA', 'SG', 'KR', 'LK', 'SY', 'TW', 'TJ', 'TH', 'TL', 'TR', 'TM', 'AE', 'UZ', 'VN', 'YE'],
    'Europe': ['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA'],
    'Africa': ['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CD', 'CG', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'SZ', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW'],
    'North America': ['AG', 'BS', 'BB', 'BZ', 'CA', 'CR', 'CU', 'DM', 'DO', 'SV', 'GD', 'GT', 'HT', 'HN', 'JM', 'MX', 'NI', 'PA', 'KN', 'LC', 'VC', 'TT', 'US', 'PR', 'GL'],
    'South America': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'],
    'Oceania': ['AU', 'FJ', 'KI', 'MH', 'FM', 'NR', 'NZ', 'PW', 'PG', 'WS', 'SB', 'TO', 'TV', 'VU'],
    'Antarctica': ['AQ']
};

const CONTINENT_REVERSE = {};
Object.entries(CONTINENT_COUNTRIES).forEach(([name, codes]) =>
    codes.forEach(code => { CONTINENT_REVERSE[code] = name; })
);

// Distinct colors per continent
const CONTINENT_COLORS_MAP = {
    'Asia': '#6366f1',
    'Europe': '#22c55e',
    'Africa': '#f59e0b',
    'North America': '#3b82f6',
    'South America': '#10b981',
    'Oceania': '#f97316',
    'Antarctica': '#64748b'
};

// Approximate label centers (left%, top%) on a standard world-map projection
const CONTINENT_LABEL_POSITIONS = {
    'Asia': { left: '68%', top: '34%' },
    'Europe': { left: '51%', top: '22%' },
    'Africa': { left: '49%', top: '58%' },
    'North America': { left: '19%', top: '30%' },
    'South America': { left: '27%', top: '70%' },
    'Oceania': { left: '81%', top: '72%' },
};

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
    // IMPORTANT: Charts must be initialized FIRST — initCustomDatePicker() calls
    // setQuickDateRange('all') → loadData() → updateCharts() synchronously on first load.
    // If charts don't exist yet, updateCharts() crashes and blanks all data.
    initCharts();

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
        changePage(0);
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

    // See All Handlers button
    document.getElementById('seeAllHandlers').addEventListener('click', showAllHandlersModal);

    // See All Categories button
    document.getElementById('seeAllCategories').addEventListener('click', showAllCategoriesModal);

    // See All Countries button
    const seeAllCountriesBtn = document.getElementById('seeAllCountries');
    if (seeAllCountriesBtn) seeAllCountriesBtn.addEventListener('click', showAllCountriesModal);

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

// Build filter params for RPC calls
function buildRpcParams() {
    const fromDate = filters.from ? (filters.from.includes('T') ? filters.from.split('T')[0] : filters.from) : null;
    const toDate = filters.to ? (filters.to.includes('T') ? filters.to.split('T')[0] : filters.to) : null;

    // Only include parameters that actually have values
    // PostgREST 404s if JSON null is passed for a TEXT[] array parameter
    const params = {};
    if (fromDate) params.p_from = fromDate;
    if (toDate) params.p_to = toDate;
    if (filters.agents.size > 0) params.p_agents = Array.from(filters.agents);
    if (filters.teams.size > 0) params.p_teams = Array.from(filters.teams);
    if (filters.categories.size > 0) params.p_categories = Array.from(filters.categories);
    if (filters.sla && filters.sla.size > 0) params.p_sla = Array.from(filters.sla);
    if (filters.search) params.p_search = filters.search;

    return params;
}

async function loadAggregates() {
    const params = buildRpcParams();
    console.log('[RPC] dashboard_aggregates', params);
    const { data, error } = await supabaseClient.rpc('dashboard_aggregates', params);
    if (error) throw error;
    return data;
}

async function loadFilterOptions() {
    const { data, error } = await supabaseClient.rpc('dashboard_filter_options');
    if (error) throw error;
    return data;
}

async function loadTablePage() {
    const params = buildRpcParams();
    params.p_sort_col = sortColumn;
    params.p_sort_dir = sortDirection;
    params.p_offset = (currentPage - 1) * pageSize;
    params.p_limit = pageSize;
    console.log('[RPC] dashboard_table_page', params);
    const { data, error } = await supabaseClient.rpc('dashboard_table_page', params);
    if (error) throw error;
    return data;
}

async function loadData() {
    elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">⏳ Loading dashboard...</td></tr>';

    try {
        // Load aggregates and table page in parallel
        const [aggData, tableData] = await Promise.all([
            loadAggregates(),
            loadTablePage()
        ]);

        aggregates = aggData;
        tableTotal = tableData.total || 0;

        console.log('[RPC] aggregates loaded, total:', aggregates.total);

        if (aggregates.total === 0) {
            elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">No tickets found.</td></tr>';
            updateDashboard();
            return;
        }

        // Populate filter dropdowns (once)
        populateFilters();

        // Render dashboard from pre-aggregated data
        updateDashboard();

        // Render table from server-paginated rows
        renderTableFromData(tableData);

    } catch (error) {
        console.error('[RPC] error', error);
        const errMsg = error.message || String(error);
        elements.tableBody.innerHTML = `<tr><td colspan="8" class="loading">❌ Error: ${errMsg}</td></tr>`;
        // Also show in the global error banner so the user can see it
        if (typeof __showErr === 'function') __showErr('❌ RPC ERROR in loadData: ' + errMsg);
    }
}

let filtersInitialized = false;

async function populateFilters() {
    if (filtersInitialized) return;

    try {
        const opts = await loadFilterOptions();
        const agents = opts.agents || [];
        const teams = opts.teams || [];
        const categories = opts.categories || [];

        if (agents.length > 0 || teams.length > 0 || categories.length > 0) {
            initSearchableDropdown('agent', agents, 'All Agents');
            initSearchableDropdown('team', teams, 'All Teams');
            initSearchableDropdown('category', categories, 'All Categories');
            filtersInitialized = true;
        }
    } catch (e) { console.warn('Failed to load filter options', e); }
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
    loadData();  // Reloads aggregates + table page from server
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

    filters.search = '';
    elements.searchInput.value = '';

    updateFilterUI();

    // Reset date picker to default (All time)
    setQuickDateRange('all');
}


function setQuickDateRange(range) {
    let today = new Date();
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
        case 'q1':
            // Q1 2026: January 1 - March 31
            start = new Date(2026, 0, 1); // Jan 1 2026
            today = new Date(2026, 2, 31, 23, 59, 59, 999); // Mar 31 2026
            label = 'Q1 2026 (Jan-Mar)';
            break;
        case 'q2':
            // Q2 2026: April 1 - June 30
            start = new Date(2026, 3, 1); // Apr 1 2026
            today = new Date(2026, 5, 30, 23, 59, 59, 999); // Jun 30 2026
            label = 'Q2 2026 (Apr-Jun)';
            break;
        case 'q3':
            // Q3 2025: July 1 - September 30
            start = new Date(2025, 6, 1); // Jul 1 2025
            today = new Date(2025, 8, 30, 23, 59, 59, 999); // Sep 30 2025
            label = 'Q3 2025 (Jul-Sep)';
            break;
        case 'q4':
            // Q4 2025: October 1 - December 31
            start = new Date(2025, 9, 1); // Oct 1 2025
            today = new Date(2025, 11, 31, 23, 59, 59, 999); // Dec 31 2025
            label = 'Q4 2025 (Oct-Dec)';
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
    if (!aggregates) return;
    updateMetrics();
    updateCharts();
    // Table is rendered separately via renderTableFromData
}

function updateMetrics() {
    if (!aggregates) return;
    const total = aggregates.total || 0;
    const met = aggregates.sla_met || 0;
    const missed = aggregates.sla_missed || 0;

    elements.totalTickets.textContent = total.toLocaleString();

    // SLA percentages
    const metPct = total ? (met / total) * 100 : 0;
    const missedPct = total ? (missed / total) * 100 : 0;
    elements.slaMet.textContent = total > 0 ? `${Math.round(metPct)}%` : '-';
    elements.slaMissed.textContent = total > 0 ? `${Math.round(missedPct)}%` : '-';

    // SLA ticket counts
    if (elements.slaMetCount) elements.slaMetCount.textContent = `(${met})`;
    if (elements.slaMissedCount) elements.slaMissedCount.textContent = `(${missed})`;

    // Average resolution time
    const avgMin = aggregates.avg_resolution_minutes;
    elements.avgResolution.textContent = avgMin ? formatMinutes(avgMin) : '-';
}

function calculateAverageResolution() {
    if (!aggregates) return null;
    const avgMin = aggregates.avg_resolution_minutes;
    return avgMin ? formatMinutes(avgMin) : null;
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

function initContinentMap() {
    const container = document.getElementById('continentMap');
    if (!container || typeof jsVectorMap === 'undefined') return;
    try {
        continentMapInstance = new jsVectorMap({
            selector: '#continentMap',
            map: 'world',
            backgroundColor: 'transparent',
            zoomOnScroll: false,
            zoomButtons: false,
            regionStyle: {
                initial: { fill: '#1e1b4b', stroke: '#2d2b6e', strokeWidth: 0.5, fillOpacity: 1 },
                hover: { fillOpacity: 0.75, cursor: 'pointer' }
            },
            onRegionTooltipShow(event, tooltip, code) {
                const continent = CONTINENT_REVERSE[code.toUpperCase()];
                if (continent && continentCurrentData[continent]) {
                    const count = continentCurrentData[continent];
                    const total = Object.values(continentCurrentData).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                    tooltip.text(`${continent}\n${count.toLocaleString()} tickets  (${pct}%)`, true);
                } else if (continent) {
                    tooltip.text(`${continent}\nNo data`, true);
                }
            }
        });
    } catch (e) { console.warn('continentMap init failed', e); }
}

function applyContientColors(data) {
    // Inject CSS !important rules — CSS !important overrides jsvectormap's inline style.fill
    // NOTE: jsvectormap world.js uses UPPERCASE keys → data-code values are UPPERCASE (e.g. "US", "CN")
    let css = '';
    Object.entries(CONTINENT_COUNTRIES).forEach(([continent, codes]) => {
        const color = CONTINENT_COLORS_MAP[continent];
        if (!color || !(data[continent] > 0)) return;
        const sels = codes
            .map(c => `#continentMap path[data-code="${c}"]`)   // c is already uppercase
            .join(',');
        css += `${sels}{fill:${color}!important}\n`;
        const hoverSels = codes
            .map(c => `#continentMap path[data-code="${c}"]:hover`)
            .join(',');
        css += `${hoverSels}{opacity:0.65}\n`;
    });
    let styleEl = document.getElementById('continent-colors-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'continent-colors-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
}

function renderContinentLabels(container, data, total) {
    container.querySelectorAll('.continent-label').forEach(el => el.remove());
    Object.entries(CONTINENT_LABEL_POSITIONS).forEach(([continent, pos]) => {
        const count = data[continent] || 0;
        if (!count) return;
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const color = CONTINENT_COLORS_MAP[continent] || '#fff';
        const label = document.createElement('div');
        label.className = 'continent-label';
        label.style.left = pos.left;
        label.style.top = pos.top;
        label.innerHTML = `<span class="cont-count" style="color:${color}">${count.toLocaleString()}</span><span class="cont-pct">${pct}%</span>`;
        container.appendChild(label);
    });
}

function updateContinentMap(data) {
    const container = document.getElementById('continentMap');
    if (!container || typeof jsVectorMap === 'undefined') return;

    continentCurrentData = { ...data };
    const total = Object.values(data).reduce((a, b) => a + b, 0);

    // Recreate map
    if (continentMapInstance) {
        try { continentMapInstance.destroy(); } catch (_) { }
        continentMapInstance = null;
        container.innerHTML = '';
    }

    try {
        continentMapInstance = new jsVectorMap({
            selector: '#continentMap',
            map: 'world',
            backgroundColor: 'transparent',
            zoomOnScroll: false,
            zoomButtons: false,
            regionStyle: {
                initial: { fill: '#1e1b4b', stroke: '#1a1833', strokeWidth: 0.4, fillOpacity: 1 },
                hover: { cursor: 'pointer' }
            },
            onRegionTooltipShow(event, tooltip, code) {
                const continent = CONTINENT_REVERSE[code.toUpperCase()];
                if (continent && continentCurrentData[continent]) {
                    const count = continentCurrentData[continent];
                    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                    tooltip.text(`${continent}\n${count.toLocaleString()} tickets (${pct}%)`, true);
                } else if (continent) {
                    tooltip.text(`${continent}\nNo data`, true);
                }
            }
        });

        // Inject CSS !important rules so continent fills override jsvectormap's inline styles
        applyContientColors(data);

        // Add floating data labels
        requestAnimationFrame(() => renderContinentLabels(container, data, total));
    } catch (e) { console.warn('continentMap update failed', e); }
}

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

    // 9. Continent World Map (jsvectormap) — initialised empty; data set by updateContinentMap()
    initContinentMap();

    // 10. Country Chart (Horizontal Bar – Top 10)
    countryChart = new Chart(document.getElementById('countryChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { right: 44 } },
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
                y: { ticks: { color: '#a0a0b0', font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

function updateCharts() {
    if (!aggregates) return;

    // 1. Daily Volume
    updateDailyChartOnly();

    // 2. Team Distribution (Doughnut)
    const teamDataMap = aggregates.teams || {};
    const teamLabels = Object.keys(teamDataMap).sort((a, b) => teamDataMap[b] - teamDataMap[a]);

    teamChart._fullLabels = teamLabels;
    teamChart.data.labels = teamLabels.map(getShortTeamName);
    const teamColors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e'];
    teamChart.data.datasets = [{
        data: teamLabels.map(l => teamDataMap[l]),
        backgroundColor: teamColors
    }];
    teamChart.update();

    renderTeamDistList(teamLabels, teamLabels.map(l => teamDataMap[l]), teamColors);

    // 3. SLA Breakdown (Pie)
    const slaMet = aggregates.sla_met || 0;
    const slaMissed = aggregates.sla_missed || 0;
    const slaNa = aggregates.sla_na || 0;
    slaChart.data.labels = ['Met', 'Missed', 'N/A'];
    slaChart.data.datasets = [{
        data: [slaMet, slaMissed, slaNa],
        backgroundColor: ['#22c55e', '#ef4444', '#6b7280']
    }];
    slaChart.update();

    // 4. Top 10 Handlers
    const handlersMap = aggregates.handlers || {};
    const sortedHandlers = Object.entries(handlersMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
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
    window.allHandlersData = Object.entries(handlersMap).sort((a, b) => b[1] - a[1]);

    // 5. Team SLA Performance & Avg Resolution
    updateTeamSlaChartOnly();

    // 6. Category Distribution
    const catMap = aggregates.categories || {};
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
    const ptMap = aggregates.product_types || {};
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
    if (elements.slaNaNote) elements.slaNaNote.style.display = slaNa > 0 ? 'block' : 'none';

    // 9. Continent Distribution (World Map Heatmap)
    const continentCounts = aggregates.continents || {};
    updateContinentMap(continentCounts);

    // 10. Top 10 Countries (Horizontal Bar)
    if (countryChart) {
        const countryMap = aggregates.countries || {};
        const sortedCountries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
        countryChart.data.labels = sortedCountries.map(([name]) => name);
        countryChart.data.datasets = [{
            data: sortedCountries.map(([, v]) => v),
            backgroundColor: 'rgba(99, 102, 241, 0.7)',
            borderColor: '#6366f1',
            borderWidth: 1
        }];
        const cMax = Math.max(...(countryChart.data.datasets[0]?.data || [0]), 0);
        countryChart.options.scales.x.suggestedMax = Math.ceil((cMax * 1.14) / 10) * 10 || 10;
        countryChart.update();
    }

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
    if (!aggregates || !aggregates.agent_sla) return;

    const agentSlaArr = aggregates.agent_sla;

    const sortedAgents = agentSlaArr
        .map(d => {
            const totalSla = (d.met || 0) + (d.missed || 0);
            const pct = totalSla ? Math.round((d.met / totalSla) * 100) : 0;
            const avgResMin = d.avg_handle_min || 0;
            return { name: d.name, total: d.total, met: d.met || 0, missed: d.missed || 0, na: d.na || 0, pct, avgResMin };
        })
        .sort((a, b) => b.total - a.total)
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
// Leftover logic removed

function renderTeamSlaMiniLegend() {
    const el = document.getElementById('teamSlaMiniLegend');
    if (!el) return;
    el.innerHTML = `
        <div class="item"><span class="dot" style="background:#22c55e"></span>SLA Met %</div>
        <div class="item"><span class="dot" style="background:#6366f1"></span>Avg Res (${uiUnits.teamSla})</div>
    `;
}

function updateTeamSlaChartOnly() {
    if (!teamSlaChart || !aggregates || !aggregates.team_sla) return;

    const teamSlaArr = aggregates.team_sla;
    const teamsSorted = teamSlaArr.map(t => t.team).sort();

    const teamLookup = {};
    teamSlaArr.forEach(t => { teamLookup[t.team] = t; });

    const slaPcts = teamsSorted.map(t => {
        const s = teamLookup[t];
        const total = (s.met || 0) + (s.missed || 0) + (s.na || 0);
        return total ? Math.round((s.met / total) * 100) : 0;
    });

    const resAvgsMin = teamsSorted.map(t => {
        return teamLookup[t].avg_res || 0;
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
// Leftover logic removed

function updateAvgResChartOnly() {
    if (!avgResChart || !aggregates) return;

    const arw = aggregates.avg_res_work || {};
    const whAvg = arw.work_count > 0 ? (arw.work_sum / arw.work_count) : 0;
    const nwhAvg = arw.nonwork_count > 0 ? (arw.nonwork_sum / arw.nonwork_count) : 0;

    const dataMin = [whAvg, nwhAvg];

    avgResChart.data.labels = ['Work Hours', 'After Hours'];
    avgResChart.data.datasets = [{ data: dataMin, backgroundColor: ['#22c55e', '#6366f1'] }];

    avgResChart.options.plugins.datalabels.formatter = (v) => formatDuration(v, uiUnits.avgRes);
    avgResChart.options.plugins.tooltip.callbacks.label = (ctx) => `Resolution: ${formatDuration(ctx.raw, uiUnits.avgRes)}`;

    const avgMax = Math.max(...dataMin, 0);
    avgResChart.options.scales.y.suggestedMax = avgMax * 1.2 || 10;

    avgResChart.update();
}
// Leftover logic removed

function updateDailyChartOnly() {
    if (!dailyChart || !aggregates) return;

    const viewMode = uiUnits.dailyView; // 'day', 'week', 'month'
    const dailyData = aggregates.daily || {};

    let labels = [];
    let data = [];
    let fullDates = [];

    if (viewMode === 'day') {
        const allSortedDates = Object.keys(dailyData).sort();
        const sortedDates = allSortedDates.slice(-30);

        window.dailyChartFullData = { allDates: allSortedDates, dailyData: dailyData };

        let prevMonth = null;
        labels = sortedDates.map((dateStr, idx) => {
            const d = new Date(dateStr + 'T00:00:00');
            const day = d.getDate();
            const monthNum = d.getMonth();
            const month = d.toLocaleString('default', { month: 'short' });
            let label = '';
            if (idx === 0 || (prevMonth !== null && monthNum !== prevMonth)) {
                label = `${month} ${day}`;
            } else {
                label = day.toString();
            }
            prevMonth = monthNum;
            return label;
        });

        data = sortedDates.map(d => dailyData[d]);
        fullDates = sortedDates;

    } else if (viewMode === 'week') {
        const weeklyData = {};
        const weekRanges = {};
        Object.entries(dailyData).forEach(([dateStr, cnt]) => {
            const d = new Date(dateStr + 'T00:00:00');
            const dayOfWeek = d.getDay();
            const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const weekStart = new Date(d);
            weekStart.setDate(diff);
            const weekKey = formatDateLocal(weekStart);
            weeklyData[weekKey] = (weeklyData[weekKey] || 0) + cnt;
            if (!weekRanges[weekKey]) {
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weekRanges[weekKey] = { start: weekStart, end: weekEnd };
            }
        });

        const allSortedWeeks = Object.keys(weeklyData).sort();
        const sortedWeeks = allSortedWeeks.slice(-30);

        window.dailyChartFullData = { allWeeks: allSortedWeeks, weeklyData: weeklyData, weekRanges: weekRanges };

        labels = sortedWeeks.map(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const month = d.toLocaleString('default', { month: 'short' });
            const day = d.getDate();
            const year = d.getFullYear();
            if (d.getMonth() === 0 && day <= 7) return `${year}\n${month} ${day}`;
            return `${month} ${day}`;
        });

        data = sortedWeeks.map(w => weeklyData[w]);
        dailyChart._weekRanges = sortedWeeks.map(weekKey => weekRanges[weekKey]);
        fullDates = sortedWeeks;

    } else {
        const monthlyData = {};
        Object.entries(dailyData).forEach(([dateStr, cnt]) => {
            const d = new Date(dateStr + 'T00:00:00');
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = (monthlyData[monthKey] || 0) + cnt;
        });

        const allSortedMonths = Object.keys(monthlyData).sort();
        const sortedMonths = allSortedMonths.slice(-12);

        window.dailyChartFullData = { allMonths: allSortedMonths, monthlyData: monthlyData };

        labels = sortedMonths.map(monthKey => {
            const [year, month] = monthKey.split('-');
            const d = new Date(parseInt(year), parseInt(month) - 1, 1);
            return d.toLocaleString('default', { month: 'short', year: 'numeric' });
        });

        data = sortedMonths.map(m => monthlyData[m]);
        fullDates = sortedMonths;
        dailyChart._weekRanges = null;
    }

    dailyChart._fullDates = fullDates;

    dailyChart.data.labels = labels;
    dailyChart.data.datasets = [{
        label: 'Tickets',
        data: data,
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: '#6366f1',
        borderWidth: 1
    }];

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
// Leftover logic removed

// ============================================
// TABLE
// ============================================

// Render table from server-paginated data
function renderTableFromData(tableData) {
    const rows = tableData.rows || [];
    const total = tableData.total || 0;

    if (rows.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="7" class="loading">No tickets found</td></tr>';
    } else {
        elements.tableBody.innerHTML = rows.map((ticket, index) => {
            const displaySla = ticket.sla_status || '-';
            const slaClass = displaySla !== '-' ? displaySla.toLowerCase() : 'na';

            const ticketIdDisplay = ticket.intercom_id
                ? `<a href="https://app.intercom.com/a/inbox/aphmhtyj/inbox/conversation/${ticket.intercom_id}?view=List" target="_blank" class="ticket-id-link" onclick="event.stopPropagation()">${ticket.ticket_id || '-'}</a>`
                : (ticket.ticket_id || '-');

            return `
            <tr class="clickable-row" data-index="${index}">
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
                showTicketDetails(rows[idx]);
            });
        });
    }

    // Update pagination
    const totalPages = Math.ceil(total / pageSize) || 1;
    elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${total.toLocaleString()} tickets)`;
    elements.prevPage.disabled = currentPage === 1;
    elements.nextPage.disabled = currentPage >= totalPages;
}

// Keep old renderTable as a wrapper for compat
function renderTable() {
    // With RPC, table is rendered via renderTableFromData after loadTablePage
    // This is called from updateDashboard for compat but table is already rendered
}

async function changePage(delta) {
    const totalPages = Math.ceil(tableTotal / pageSize) || 1;
    const newPage = currentPage + delta;
    if (newPage < 1 || newPage > totalPages) return;
    currentPage = newPage;
    elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">⏳ Loading...</td></tr>';
    try {
        const tableData = await loadTablePage();
        tableTotal = tableData.total || 0;
        renderTableFromData(tableData);
    } catch (e) {
        elements.tableBody.innerHTML = `<tr><td colspan="8" class="loading">❌ Error: ${e.message}</td></tr>`;
    }
}
// Old render logic removed

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

    // Build from aggregates
    const hs = aggregates ? (aggregates.handlers || {}) : {};
    window.allHandlersData = Object.entries(hs).sort((a, b) => b[1] - a[1]);

    modal.classList.add('active');

    handlersCurrentPage = 1;
    renderHandlersPage();

    // Event listeners
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

    // Build category data from aggregates
    const cs = aggregates ? (aggregates.categories || {}) : {};
    allCategoriesData = Object.entries(cs).sort((a, b) => b[1] - a[1]);

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
// ALL COUNTRIES MODAL
// ============================================

let allCountriesData = [];
let countriesPageNum = 1;
const countriesPageSize = 20;

function showAllCountriesModal() {
    const modal = document.getElementById('countriesModal');

    // Build country data from aggregates
    const cs = aggregates ? (aggregates.countries || {}) : {};
    allCountriesData = Object.entries(cs).sort((a, b) => b[1] - a[1]);

    countriesPageNum = 1;
    renderCountriesPage();

    modal.classList.add('active');

    document.getElementById('countriesPrev').onclick = () => {
        if (countriesPageNum > 1) { countriesPageNum--; renderCountriesPage(); }
    };
    document.getElementById('countriesNext').onclick = () => {
        const totalPages = Math.ceil(allCountriesData.length / countriesPageSize);
        if (countriesPageNum < totalPages) { countriesPageNum++; renderCountriesPage(); }
    };

    document.addEventListener('keydown', handleCountriesEscapeKey);
    modal.addEventListener('click', handleCountriesOutsideClick);
}

function renderCountriesPage() {
    const totalPages = Math.max(1, Math.ceil(allCountriesData.length / countriesPageSize));
    document.getElementById('countriesPageInfo').textContent = `Page ${countriesPageNum} of ${totalPages}`;
    document.getElementById('countriesPrev').disabled = countriesPageNum === 1;
    document.getElementById('countriesNext').disabled = countriesPageNum >= totalPages;

    const start = (countriesPageNum - 1) * countriesPageSize;
    const pageItems = allCountriesData.slice(start, start + countriesPageSize);
    const maxCount = allCountriesData.length > 0 ? allCountriesData[0][1] : 1;

    const container = document.getElementById('countriesTableContainer');
    container.innerHTML = pageItems.map(([name, count], idx) => {
        const rank = start + idx + 1;
        const pct = ((count / maxCount) * 100).toFixed(0);
        return `
            <div class="handler-row">
                <span class="handler-rank">#${rank}</span>
                <span class="handler-name" title="${name}">${name}</span>
                <div class="handler-bar-container">
                    <div class="handler-bar" style="width:${pct}%"></div>
                </div>
                <span class="handler-count">${count}</span>
            </div>`;
    }).join('');
}

function closeCountriesModal() {
    const modal = document.getElementById('countriesModal');
    modal.classList.remove('active');
    document.removeEventListener('keydown', handleCountriesEscapeKey);
    modal.removeEventListener('click', handleCountriesOutsideClick);
}

function handleCountriesEscapeKey(e) {
    if (e.key === 'Escape') closeCountriesModal();
}

function handleCountriesOutsideClick(e) {
    if (e.target.classList.contains('modal')) closeCountriesModal();
}

// ============================================
// AGENT DETAIL MODAL
// ============================================

async function showAgentDetails(agentName) {
    const modal = document.getElementById('agentDetailModal');
    const title = document.getElementById('agentDetailTitle');
    const body = document.getElementById('agentDetailBody');

    title.textContent = `Tickets for ${agentName}`;
    body.innerHTML = '<div class="agent-detail-section"><p class="loading">Loading tickets from database...</p></div>';

    modal.classList.add('active');

    document.addEventListener('keydown', handleAgentDetailEscapeKey);
    modal.addEventListener('click', handleAgentDetailOutsideClick);

    try {
        // Query Supabase for this agent's tickets matching current filters
        const params = buildRpcParams();
        let query = supabaseClient.from('ticket_logs')
            .select('date, ticket_id, intercom_id, agent_sla_status')
            .eq('ticket_handler_agent_name', agentName)
            .order('date', { ascending: false })
            .limit(1000); // Max 1000 per agent to keep browser happy

        if (params.p_from) query = query.gte('date', params.p_from);
        if (params.p_to) query = query.lte('date', params.p_to);
        if (params.p_teams) query = query.in('current_team', params.p_teams);
        if (params.p_categories) query = query.in('issue_category', params.p_categories);
        if (params.p_sla) query = query.or(`ticket_sla_status.in.(${params.p_sla.join(',')}),sla.in.(${params.p_sla.join(',')})`);

        const { data: tickets, error } = await query;
        if (error) throw error;

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
            ${tickets.length === 1000 ? '<p style="text-align:center; font-size:12px; color:#6b7280; margin-top:10px;">Showing top 1000 recent tickets for this agent</p>' : ''}
        `;

    } catch (err) {
        console.error('Error loading agent tickets', err);
        body.innerHTML = `<div class="agent-detail-section"><p class="loading" style="color:#ef4444">Failed to load tickets: ${err.message}</p></div>`;
    }
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
