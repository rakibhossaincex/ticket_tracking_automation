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

// Charts
let dailyChart, teamChart, slaChart, handlerChart, teamSlaChart, allHandlersChart;

// DOM Elements
const elements = {
    dateRange: document.getElementById('dateRange'),
    agentFilter: document.getElementById('agentFilter'),
    teamFilter: document.getElementById('teamFilter'),
    slaFilter: document.getElementById('slaFilter'),
    searchInput: document.getElementById('searchInput'),
    resetFilters: document.getElementById('resetFilters'),
    refreshBtn: document.getElementById('refreshBtn'),
    lastUpdated: document.getElementById('lastUpdated'),
    totalTickets: document.getElementById('totalTickets'),
    slaMet: document.getElementById('slaMet'),
    slaMissed: document.getElementById('slaMissed'),
    avgResolution: document.getElementById('avgResolution'),
    tableBody: document.getElementById('tableBody'),
    pageSize: document.getElementById('pageSize'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    exportCsv: document.getElementById('exportCsv')
};

// Initialize Flatpickr
let datePicker;

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    // Initialize date picker
    datePicker = flatpickr(elements.dateRange, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        theme: 'dark',
        onChange: applyFilters
    });

    // Event Listeners for searchable dropdowns are set up in initSearchableDropdowns
    elements.slaFilter.addEventListener('change', applyFilters);
    elements.searchInput.addEventListener('input', debounce(applyFilters, 300));
    elements.resetFilters.addEventListener('click', resetFilters);
    elements.refreshBtn.addEventListener('click', loadData);
    elements.pageSize.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
    });
    elements.prevPage.addEventListener('click', () => changePage(-1));
    elements.nextPage.addEventListener('click', () => changePage(1));
    elements.exportCsv.addEventListener('click', exportToCsv);

    // Quick date buttons
    document.querySelectorAll('[data-range]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const range = e.target.dataset.range;
            setQuickDateRange(range);
        });
    });

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

    // Load data
    await loadData();

    // Auto-refresh data every 5 minutes (300000ms)
    setInterval(async () => {
        console.log('🔄 Auto-refreshing data...');
        await loadData();
    }, 300000);
}

// ============================================
// DATA LOADING
// ============================================

async function loadData() {
    elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">Loading data...</td></tr>';
    console.log('🔄 Loading data from Supabase...');

    try {
        // Fetch all data with pagination (Supabase default limit is 1000)
        let allRecords = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, error } = await supabaseClient
                .from('ticket_logs')
                .select('*')
                .order('date', { ascending: false })
                .range(from, to);

            if (error) {
                console.error('❌ Supabase error:', error);
                throw error;
            }

            if (data && data.length > 0) {
                allRecords = allRecords.concat(data);
                console.log(`📊 Page ${page + 1}: fetched ${data.length} records (total: ${allRecords.length})`);
                page++;
                hasMore = data.length === pageSize;
            } else {
                hasMore = false;
            }
        }

        console.log(`✅ Loaded ${allRecords.length} total tickets`);

        if (allRecords.length === 0) {
            console.warn('⚠️ No data returned from Supabase');
            elements.tableBody.innerHTML = '<tr><td colspan="8" class="loading">No tickets found in database.</td></tr>';
            return;
        }

        allData = allRecords;
        filteredData = [...allData];

        // Populate filter dropdowns
        populateFilters();

        // Apply any existing filters
        applyFilters();

        // Update last updated time
        elements.lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

    } catch (error) {
        console.error('❌ Error loading data:', error);
        elements.tableBody.innerHTML = `<tr><td colspan="8" class="loading">Error: ${error.message}</td></tr>`;
    }
}

function populateFilters() {
    // Get unique agents and teams
    const agents = [...new Set(allData.map(t => t.ticket_handler_agent_name).filter(Boolean))].sort();
    const teams = [...new Set(allData.map(t => t.current_team).filter(Boolean))].sort();

    // Initialize searchable dropdowns
    initSearchableDropdown('agent', agents, 'All Agents');
    initSearchableDropdown('team', teams, 'All Teams');
}

function initSearchableDropdown(type, options, placeholder) {
    const searchInput = document.getElementById(`${type}Search`);
    const optionsContainer = document.getElementById(`${type}Options`);
    const hiddenInput = document.getElementById(`${type}Filter`);

    // Render all options
    function renderOptions(filter = '') {
        const filtered = filter
            ? options.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
            : options;

        let html = `<div class="dropdown-option ${hiddenInput.value === '' ? 'selected' : ''}" data-value="">${placeholder}</div>`;
        html += filtered.map(o =>
            `<div class="dropdown-option ${hiddenInput.value === o ? 'selected' : ''}" data-value="${o}">${o}</div>`
        ).join('');

        optionsContainer.innerHTML = html;

        // Add click handlers
        optionsContainer.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.addEventListener('click', () => {
                hiddenInput.value = opt.dataset.value;
                searchInput.value = opt.dataset.value || '';
                searchInput.placeholder = opt.dataset.value || placeholder;
                optionsContainer.classList.remove('active');
                applyFilters();
            });
        });
    }

    // Show dropdown on focus/click
    searchInput.addEventListener('focus', () => {
        renderOptions(searchInput.value);
        optionsContainer.classList.add('active');
    });

    searchInput.addEventListener('click', () => {
        renderOptions(searchInput.value);
        optionsContainer.classList.add('active');
    });

    // Filter on input
    searchInput.addEventListener('input', () => {
        renderOptions(searchInput.value);
        optionsContainer.classList.add('active');
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest(`#${type}Dropdown`)) {
            optionsContainer.classList.remove('active');
        }
    });

    // Initial render
    renderOptions();
}

// ============================================
// FILTERING
// ============================================

function applyFilters() {
    const dateRange = datePicker.selectedDates;
    const agent = elements.agentFilter.value;
    const team = elements.teamFilter.value;
    const sla = elements.slaFilter.value;
    const search = elements.searchInput.value.toLowerCase();

    filteredData = allData.filter(ticket => {
        // Date filter
        if (dateRange.length === 2) {
            const ticketDate = new Date(ticket.date);
            if (ticketDate < dateRange[0] || ticketDate > dateRange[1]) return false;
        }

        // Agent filter
        if (agent && ticket.ticket_handler_agent_name !== agent) return false;

        // Team filter
        if (team && ticket.current_team !== team) return false;

        // SLA filter
        if (sla && ticket.sla !== sla) return false;

        // Search filter
        if (search) {
            const searchFields = [
                ticket.ticket_id,
                ticket.description_last_ticket_note,
                ticket.issue_category
            ].join(' ').toLowerCase();
            if (!searchFields.includes(search)) return false;
        }

        return true;
    });

    currentPage = 1;
    updateDashboard();
}

function resetFilters() {
    datePicker.clear();
    elements.agentFilter.value = '';
    elements.teamFilter.value = '';
    elements.slaFilter.value = '';
    elements.searchInput.value = '';

    // Clear searchable dropdown inputs
    document.getElementById('agentSearch').value = '';
    document.getElementById('agentSearch').placeholder = 'Search agents...';
    document.getElementById('teamSearch').value = '';
    document.getElementById('teamSearch').placeholder = 'Search teams...';

    document.querySelectorAll('[data-range]').forEach(btn => btn.classList.remove('active'));

    filteredData = [...allData];
    currentPage = 1;
    updateDashboard();
}

function setQuickDateRange(range) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (range) {
        case 'today':
            break;
        case '7days':
            start.setDate(start.getDate() - 6);
            break;
        case '30days':
            start.setDate(start.getDate() - 29);
            break;
        case 'month':
            start.setDate(1);
            break;
    }

    datePicker.setDate([start, today]);

    // Update button states
    document.querySelectorAll('[data-range]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === range);
    });

    applyFilters();
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
    const total = filteredData.length;
    const metSLA = filteredData.filter(t => t.sla === 'Met').length;
    const missedSLA = filteredData.filter(t => t.sla === 'Missed').length;

    elements.totalTickets.textContent = total.toLocaleString();
    elements.slaMet.textContent = total > 0 ? `${Math.round((metSLA / total) * 100)}%` : '-';
    elements.slaMissed.textContent = total > 0 ? `${Math.round((missedSLA / total) * 100)}%` : '-';

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

    // Daily Chart - shows values on top of bars (inside if >90% of max)
    dailyChart = new Chart(document.getElementById('dailyChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#a0a0b0' } },
                datalabels: {
                    color: '#ffffff',
                    anchor: (context) => {
                        const max = Math.max(...context.dataset.data);
                        const value = context.dataset.data[context.dataIndex];
                        return value / max > 0.9 ? 'end' : 'end';
                    },
                    align: (context) => {
                        const max = Math.max(...context.dataset.data);
                        const value = context.dataset.data[context.dataIndex];
                        // If bar is > 90% of max, show inside (bottom align)
                        return value / max > 0.9 ? 'bottom' : 'top';
                    },
                    offset: 4,
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value > 0 ? value : ''
                }
            },
            scales: {
                x: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });

    // Team Chart - shows percentages, tooltip shows count
    teamChart = new Chart(document.getElementById('teamChart'), {
        type: 'doughnut',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: '#a0a0b0', font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.raw} tickets`
                    }
                },
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = Math.round((value / total) * 100);
                        return pct > 3 ? pct + '%' : '';
                    }
                }
            }
        }
    });

    // SLA Chart - shows percentages, tooltip shows count
    slaChart = new Chart(document.getElementById('slaChart'), {
        type: 'pie',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#a0a0b0' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.raw} tickets`
                    }
                },
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = Math.round((value / total) * 100);
                        return pct > 3 ? pct + '%' : '';
                    }
                }
            }
        }
    });

    // Handler Chart - horizontal bar with values (top 10)
    handlerChart = new Chart(document.getElementById('handlerChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: '#ffffff',
                    anchor: (context) => {
                        const max = Math.max(...context.dataset.data);
                        const value = context.dataset.data[context.dataIndex];
                        // If bar is > 80% of max, anchor at end but inside
                        return value / max > 0.8 ? 'end' : 'end';
                    },
                    align: (context) => {
                        const max = Math.max(...context.dataset.data);
                        const value = context.dataset.data[context.dataIndex];
                        // If bar is > 80% of max, align left (inside bar at end)
                        return value / max > 0.8 ? 'left' : 'right';
                    },
                    offset: 4,
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value > 0 ? value : ''
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    beginAtZero: true
                },
                y: {
                    ticks: { color: '#a0a0b0', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });

    // Team SLA Performance Chart - grouped bar showing SLA % and Avg Resolution per team
    teamSlaChart = new Chart(document.getElementById('teamSlaChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#a0a0b0' } },
                datalabels: {
                    color: '#ffffff',
                    anchor: (context) => {
                        const max = Math.max(...context.dataset.data);
                        const value = context.dataset.data[context.dataIndex];
                        return value / max > 0.9 ? 'end' : 'end';
                    },
                    align: (context) => {
                        const max = Math.max(...context.dataset.data);
                        const value = context.dataset.data[context.dataIndex];
                        // If bar is > 90% of max, show inside (bottom align)
                        return value / max > 0.9 ? 'bottom' : 'top';
                    },
                    offset: 4,
                    font: { weight: 'bold', size: 10 },
                    formatter: (value, ctx) => {
                        if (ctx.datasetIndex === 0) return value + '%';
                        return value;
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.datasetIndex === 0) return `SLA Met: ${ctx.raw}%`;
                            return `Avg Resolution: ${ctx.raw}`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    type: 'linear',
                    position: 'left',
                    ticks: { color: '#22c55e' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: { display: true, text: 'SLA Met %', color: '#22c55e' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    ticks: { color: '#6366f1' },
                    grid: { display: false },
                    title: { display: true, text: 'Avg Resolution (min)', color: '#6366f1' }
                }
            }
        }
    });
}

function updateCharts() {
    // Daily volume
    const dailyData = {};
    filteredData.forEach(t => {
        if (t.date) {
            dailyData[t.date] = (dailyData[t.date] || 0) + 1;
        }
    });
    const sortedDates = Object.keys(dailyData).sort();
    dailyChart.data.labels = sortedDates;
    dailyChart.data.datasets = [{
        label: 'Tickets',
        data: sortedDates.map(d => dailyData[d]),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1
    }];
    dailyChart.update();

    // Team distribution
    const teamData = {};
    filteredData.forEach(t => {
        if (t.current_team) {
            teamData[t.current_team] = (teamData[t.current_team] || 0) + 1;
        }
    });
    const teamLabels = Object.keys(teamData);
    teamChart.data.labels = teamLabels;
    teamChart.data.datasets = [{
        data: teamLabels.map(t => teamData[t]),
        backgroundColor: [
            '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
            '#ec4899', '#f43f5e', '#ef4444', '#f97316',
            '#eab308', '#22c55e'
        ]
    }];
    teamChart.update();

    // SLA breakdown
    const metCount = filteredData.filter(t => t.sla === 'Met').length;
    const missedCount = filteredData.filter(t => t.sla === 'Missed').length;
    const noSla = filteredData.length - metCount - missedCount;
    slaChart.data.labels = ['Met', 'Missed', 'N/A'];
    slaChart.data.datasets = [{
        data: [metCount, missedCount, noSla],
        backgroundColor: ['#22c55e', '#ef4444', '#6b7280']
    }];
    slaChart.update();

    // All handlers sorted by ticket count
    const handlerData = {};
    filteredData.forEach(t => {
        const handler = t.ticket_handler_agent_name;
        if (handler && handler.trim()) {
            handlerData[handler] = (handlerData[handler] || 0) + 1;
        }
    });

    // Store all handlers globally for modal
    window.allHandlersData = Object.entries(handlerData)
        .sort((a, b) => b[1] - a[1]);

    // Show only top 10 in main chart
    const topHandlers = window.allHandlersData.slice(0, 10);

    console.log('📊 Top 10 Handlers (of ' + window.allHandlersData.length + ')');

    handlerChart.data.labels = topHandlers.map(h => h[0]);
    handlerChart.data.datasets = [{
        data: topHandlers.map(h => h[1]),
        backgroundColor: 'rgba(139, 92, 246, 0.7)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 1
    }];
    handlerChart.update();

    // Team SLA Performance with Avg Resolution Time
    const teamSlaData = {};
    filteredData.forEach(t => {
        const team = t.current_team;
        if (team) {
            if (!teamSlaData[team]) {
                teamSlaData[team] = { met: 0, missed: 0, total: 0, resolutionMinutes: [] };
            }
            teamSlaData[team].total++;
            if (t.sla === 'Met') teamSlaData[team].met++;
            if (t.sla === 'Missed') teamSlaData[team].missed++;

            // Parse resolution time
            const resMin = parseResolutionTime(t.resolution_time);
            if (resMin > 0) teamSlaData[team].resolutionMinutes.push(resMin);
        }
    });

    // Function to abbreviate team names
    function getShortTeamName(fullName) {
        const abbreviations = {
            'Pro Solutions Task Force': 'PSTF',
            'Pro Solution Task Force': 'PSTF',
            'Ticket Dependencies': 'T Dependencies',
            'CEx Reversal': 'CEx Reversal',
            'Tech Team': 'TT',
            'Platform Operations': 'PO',
            'Payments and Treasury': 'P&T',
            'Back Office': 'BO',
            'BOps': 'BOps',
            'Customer Experience': 'CEx',
            'GB Email Communication': 'GB Email Com',
            'GB Email Com': 'GB Email Com'
        };
        return abbreviations[fullName] || fullName.split(' ').map(w => w[0]).join('');
    }

    const teamNames = Object.keys(teamSlaData).sort();
    const shortTeamNames = teamNames.map(getShortTeamName);
    const slaMetPct = teamNames.map(t => {
        const d = teamSlaData[t];
        const slaTotalCount = d.met + d.missed;
        return slaTotalCount > 0 ? Math.round((d.met / slaTotalCount) * 100) : 0;
    });
    const avgResolution = teamNames.map(t => {
        const resArr = teamSlaData[t].resolutionMinutes;
        if (resArr.length === 0) return 0;
        const avg = resArr.reduce((a, b) => a + b, 0) / resArr.length;
        return Math.round(avg);
    });

    teamSlaChart.data.labels = shortTeamNames;
    teamSlaChart.data.datasets = [
        {
            label: 'SLA Met %',
            data: slaMetPct,
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 1,
            yAxisID: 'y'
        },
        {
            label: 'Avg Resolution (min)',
            data: avgResolution,
            backgroundColor: 'rgba(99, 102, 241, 0.7)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1,
            yAxisID: 'y1'
        }
    ];
    teamSlaChart.update();
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
        elements.tableBody.innerHTML = pageData.map((ticket, index) => `
            <tr class="clickable-row" data-index="${start + index}">
                <td>${ticket.date || '-'}</td>
                <td>${ticket.ticket_id || '-'}</td>
                <td>${ticket.ticket_handler_agent_name || '-'}</td>
                <td>${ticket.current_team || '-'}</td>
                <td>${ticket.resolution_time || '-'}</td>
                <td>${ticket.sla ? `<span class="sla-badge sla-${ticket.sla.toLowerCase()}">${ticket.sla}</span>` : '-'}</td>
                <td>${ticket.issue_category || '-'}</td>
            </tr>
        `).join('');

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
        t.sla,
        t.issue_category,
        `"${(t.description_last_ticket_note || '').replace(/"/g, '""')}"`
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
    sla: 'SLA Status',
    issue_category: 'Issue Category',
    description_last_ticket_note: 'Description',
    forwarded_to: 'Forwarded To',
    unique_id: 'Unique ID',
    created_at: 'Created At'
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
        'sla',
        'issue_category',
        'forwarded_to',
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
            if (field === 'sla') {
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

    // Add any additional fields not in the order list
    Object.keys(ticket).forEach(field => {
        if (!fieldOrder.includes(field) && ticket[field] !== null && ticket[field] !== undefined && ticket[field] !== '') {
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
// START
// ============================================

document.addEventListener('DOMContentLoaded', init);
