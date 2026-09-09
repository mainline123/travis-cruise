// JVIN Cruise Dashboard - Main Application Logic (Apify Console & Kiosk Edition)

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tableBodyEl = document.getElementById('table-body');

    // GitHub Pages cross-repo navigation compatibility
    const btnBack = document.getElementById('btnBack');
    if (btnBack && window.location.hostname.includes('github.io')) {
        btnBack.setAttribute('href', '../travis-airports/');
    }

    // KPI Elements
    const kpiShipsEl = document.getElementById('kpi-ships');
    const kpiPassengersEl = document.getElementById('kpi-passengers');
    const kpiPortsEl = document.getElementById('kpi-ports');
    const kpiUpdatedTimeEl = document.getElementById('kpi-updated-time');
    const kpiUpdatedDateEl = document.getElementById('kpi-updated-date');

    // Hero clock / footer elements
    const liveClockEl = document.getElementById('live-clock');
    const liveAmpmEl = document.getElementById('live-ampm');
    const liveDateEl = document.getElementById('live-date');
    const footerUpdatedEl = document.getElementById('footer-updated');

    // Configuration
    // Primary: fetch from the latest succeeded run of the cruisemapper-scraper actor
    const APIFY_DATASET_URL = 'https://api.apify.com/v2/acts/QkfiudQbVbhHCif5r/runs/last/dataset/items?token=apify_api_rztD6c43gew3LIUeHLy7wkkxLqkoJg3r8KFP&status=SUCCEEDED';
    // Fallback: direct dataset URL from latest run
    const FALLBACK_DATASET_URL = 'https://api.apify.com/v2/datasets/8yphg5hsrvkVEishc/items?token=apify_api_rztD6c43gew3LIUeHLy7wkkxLqkoJg3r8KFP';
    const AUTO_REFRESH_INTERVAL = 900000; // 15 minutes in milliseconds

    /**
     * Updates the 'Last Updated' KPI card and footer schedule timestamp
     * to reflect today's current date and the latest verification/sync time in Jamaica (EST, UTC-5).
     */
    function updateLastUpdatedTimestamp() {
        const now = new Date();
        const jamaicaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));

        let hours = jamaicaTime.getUTCHours();
        const minutes = jamaicaTime.getUTCMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;

        const timeStr = `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const dateStr = `${months[jamaicaTime.getUTCMonth()]} ${jamaicaTime.getUTCDate()}, ${jamaicaTime.getUTCFullYear()}`;

        if (kpiUpdatedTimeEl) kpiUpdatedTimeEl.textContent = timeStr;
        if (kpiUpdatedDateEl) kpiUpdatedDateEl.textContent = dateStr;
        if (footerUpdatedEl) footerUpdatedEl.textContent = `${dateStr} | ${timeStr}`;
    }

    // Static Ship Capacity Lookup Map (for known vessels docking at Ocho Rios)
    const SHIP_CAPACITIES = {
        "carnival horizon": 3960,
        "margaritaville at sea islander": 2680,
        "celebrity summit": 2158,
        "msc poesia": 2550,
        "norwegian joy": 3883,
        "carnival dream": 3646,
        "msc seascape": 5632,
        "disney treasure": 4000,
        "carnival celebration": 5282,
        "norwegian prima": 3099,
        "celebrity beyond": 3260,
        "viking mars": 930,
        "royal caribbean oasis": 6771,
        "world navigator": 196,
        "aidaprima": 3286,
        "costa pacifica": 3780,
        "holland america eurodam": 2104,
        "princess grand": 3140,
        "celebrity equinox": 2852,
        "carnival sunrise": 2984,
        "norwegian epic": 4100,
        "explorer of the seas": 3114,
        "symphony of the seas": 6680,
        "harmony of the seas": 5479,
        "allure of the seas": 5484,
        "oasis of the seas": 5400,
        "wonder of the seas": 5734,
        "icon of the seas": 5610,
        "star of the seas": 5610
    };

    /**
     * Renders the live kiosk local clock (America/Jamaica timezone, EST, UTC-5).
     */
    function renderClock() {
        const now = new Date();
        // Shift time to Jamaica (UTC-5)
        const jamaicaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));

        let hours = jamaicaTime.getUTCHours();
        const minutes = jamaicaTime.getUTCMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;

        const timeStr = `${hours}:${String(minutes).padStart(2, '0')}`;
        if (liveClockEl) liveClockEl.textContent = timeStr;
        if (liveAmpmEl) liveAmpmEl.textContent = ampm;

        // Long date in America/Jamaica format
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const dateStr = `${days[jamaicaTime.getUTCDay()]}, ${months[jamaicaTime.getUTCMonth()]} ${jamaicaTime.getUTCDate()}, ${jamaicaTime.getUTCFullYear()}`;
        if (liveDateEl) liveDateEl.textContent = dateStr;

        // Force timezones to match the Ocho Rios locale label
        const locationEl = document.querySelector('.jamaica-time .location');
        if (locationEl) {
            locationEl.textContent = 'LOCAL TIME (EST)';
        }

        const infoTextEl = document.querySelector('.cruise-footer .info-text');
        if (infoTextEl) {
            infoTextEl.innerHTML = `All times are local (EST)<br>Information subject to change`;
        }
    }

    /**
     * Calculates the target date (checks for ?date=YYYY-MM-DD parameter or defaults to today's Jamaica local date).
     * @returns {string} YYYY-MM-DD
     */
    function getTargetDate() {
        const urlParams = new URLSearchParams(window.location.search);
        const dateParam = urlParams.get('date');
        if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            return dateParam;
        }
        const now = new Date();
        const jamaicaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
        const year = jamaicaTime.getUTCFullYear();
        const month = String(jamaicaTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jamaicaTime.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Formats 24-hour scraper time ("08:00") into standard 12-hour AM/PM format ("08:00 AM").
     * @param {string} timeStr 
     * @returns {string}
     */
    function formatTime12Hour(timeStr) {
        if (!timeStr || timeStr === '--:--') return '--:--';
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    }

    /**
     * Formats database date string ("2026-09-12") to a clean compact display ("Sep 12").
     * @param {string} dateStr 
     * @returns {string}
     */
    function formatDateDisplay(dateStr) {
        if (!dateStr) return '---';
        const parts = dateStr.split('-');
        if (parts.length < 3) return dateStr;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIdx = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return `${months[monthIdx]} ${day}`;
    }

    /**
     * Parses time string to minutes since midnight for sorting and status calculations.
     * Works with both 24-hour ("08:00") and 12-hour ("08:00 AM") inputs.
     * @param {string} timeStr 
     * @returns {number}
     */
    function timeToMinutes(timeStr) {
        if (!timeStr || timeStr === '--:--') return 9999;
        
        // Check for 12-hour format first (e.g. "08:00 AM")
        const match12 = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (match12) {
            let hours = parseInt(match12[1], 10);
            const minutes = parseInt(match12[2], 10);
            const ampm = match12[3].toUpperCase();
            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
            return hours * 60 + minutes;
        }

        // Try 24-hour format (e.g. "08:00")
        const parts = timeStr.split(':');
        if (parts.length >= 2) {
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        }

        return 9999;
    }

    /**
     * Dynamically calculates status of a ship's visit based on Jamaica's local time.
     * @param {string} arriveTimeStr (e.g., "08:00")
     * @param {string} departTimeStr (e.g., "16:00")
     * @returns {string} 'In Port' | 'Expected' | 'Scheduled' | 'Departed'
     */
    function calculateStatus(arriveTimeStr, departTimeStr, shipDateStr, todayDateStr) {
        if (shipDateStr > todayDateStr) {
            return 'Scheduled';
        }
        if (shipDateStr < todayDateStr) {
            return 'Departed';
        }

        const now = new Date();
        const jamaicaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
        const currentMinutes = jamaicaTime.getUTCHours() * 60 + jamaicaTime.getUTCMinutes();

        const arrMin = timeToMinutes(arriveTimeStr);
        const depMin = timeToMinutes(departTimeStr);

        if (arrMin === 9999 && depMin === 9999) {
            return 'Scheduled';
        }

        if (arrMin !== 9999 && depMin !== 9999) {
            if (currentMinutes < arrMin) {
                return 'Expected';
            } else if (currentMinutes >= arrMin && currentMinutes <= depMin) {
                return 'In Port';
            } else {
                return 'Departed';
            }
        }

        if (arrMin !== 9999) {
            return currentMinutes < arrMin ? 'Expected' : 'In Port';
        }

        if (depMin !== 9999) {
            return currentMinutes <= depMin ? 'In Port' : 'Departed';
        }

        return 'Scheduled';
    }

    /**
     * Map port names to styling classes
     * @param {string} port 
     * @returns {string} CSS class
     */
    function getPortClass(port) {
        const name = (port || '').toLowerCase();
        if (name.includes('montego')) return 'port-montego';
        if (name.includes('falmouth')) return 'port-falmouth';
        if (name.includes('ocho')) return 'port-ocho';
        if (name.includes('kingston')) return 'port-kingston';
        return '';
    }

    /**
     * Cleans up port names by mapping them to clean, standard versions.
     * @param {string} port 
     * @returns {string} Cleaned port name
     */
    function cleanPortName(port) {
        const name = (port || '').toLowerCase().trim();
        if (name.includes('montego')) return 'Montego Bay';
        if (name.includes('falmouth')) return 'Falmouth';
        if (name.includes('ocho')) return 'Ocho Rios';
        if (name.includes('kingston')) return 'Kingston';
        return port;
    }

    /**
     * Generates HTML status badge (text only capsule)
     * @param {string} status 
     * @returns {string} HTML string
     */
    function getStatusBadge(status) {
        const stat = (status || '').toLowerCase().trim();
        if (stat === 'in port') {
            return `<span class="status-badge badge-in-port">IN PORT</span>`;
        } else if (stat === 'expected') {
            return `<span class="status-badge badge-expected">EXPECTED</span>`;
        } else if (stat === 'scheduled') {
            return `<span class="status-badge badge-scheduled">SCHEDULED</span>`;
        } else if (stat === 'departed') {
            return `<span class="status-badge badge-departed">DEPARTED</span>`;
        } else if (stat === 'cancelled') {
            return `<span class="status-badge badge-cancelled">CANCELLED</span>`;
        }
        return `<span class="status-badge">${status.toUpperCase()}</span>`;
    }

    /**
     * Dynamically calculates and adjusts the height of the table container
     * to occupy 100vh minus the height of header, footer, and other static UI elements.
     */
    function adjustTableContainerHeight() {
        const tableContainer = document.querySelector('.table-container');
        if (!tableContainer) return;

        // Get heights of elements we need to subtract
        const header = document.querySelector('body > header');
        const cruise = document.querySelector('.cruise');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const statsPanel = document.querySelector('.stats-panel');
        const footerLegend = document.querySelector('.footer-legend');
        const cruiseFooter = document.querySelector('.cruise-footer');

        const headerHeight = header ? header.offsetHeight : 0;
        const cruiseHeight = cruise ? cruise.offsetHeight : 0;
        const footerHeight = cruiseFooter ? cruiseFooter.offsetHeight : 0;

        // Inside cruise-dashboard, we have padding and vertical margins
        const dashboard = document.querySelector('.cruise-dashboard');
        let dashboardPadding = 0;
        if (dashboard) {
            const style = window.getComputedStyle(dashboard);
            dashboardPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        }

        const dashboardHeaderHeight = dashboardHeader ? dashboardHeader.offsetHeight : 0;
        let dashboardHeaderMargin = 0;
        if (dashboardHeader) {
            const style = window.getComputedStyle(dashboardHeader);
            dashboardHeaderMargin = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        }

        const statsPanelHeight = statsPanel ? statsPanel.offsetHeight : 0;
        let statsPanelMargin = 0;
        if (statsPanel) {
            const style = window.getComputedStyle(statsPanel);
            statsPanelMargin = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        }

        const footerLegendHeight = footerLegend ? footerLegend.offsetHeight : 0;
        let footerLegendMargin = 0;
        if (footerLegend) {
            const style = window.getComputedStyle(footerLegend);
            footerLegendMargin = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        }

        let tableContainerMargin = 0;
        if (tableContainer) {
            const style = window.getComputedStyle(tableContainer);
            tableContainerMargin = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        }

        const totalSubtract = headerHeight 
            + cruiseHeight 
            + footerHeight 
            + dashboardPadding 
            + dashboardHeaderHeight + dashboardHeaderMargin 
            + statsPanelHeight + statsPanelMargin 
            + footerLegendHeight + footerLegendMargin 
            + tableContainerMargin;

        const viewportHeight = window.innerHeight;
        // Leave a safety margin (e.g. 5px) to prevent vertical scrollbar on the page body
        const availableHeight = viewportHeight - totalSubtract - 5;

        tableContainer.style.height = `${Math.max(200, availableHeight)}px`;
    }

    /**
     * Loads the pre-filtered cruise data from the Apify Dataset endpoint,
     * calculates statuses, updates KPIs, and renders the schedule table.
     */
    async function fetchAndRenderData() {
        const targetDate = getTargetDate();
        
        // Show loading state while fetching
        tableBodyEl.innerHTML = `
            <tr class="loading-row">
                <td colspan="6">
                     <div class="spinner"></div>
                     <div class="loading-text">Fetching Jamaica Arrivals...</div>
                </td>
            </tr>
        `;

        try {
            let response = await fetch(APIFY_DATASET_URL);
            if (!response.ok) {
                console.warn(`Primary dataset endpoint returned ${response.status}, trying fallback dataset...`);
                response = await fetch(FALLBACK_DATASET_URL);
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            // Aggregate arrivals from all ports in the dataset
            const arrivals = [];
            let lastScrapedTime = 0;
            
            data.forEach(item => {
                if (item.recordType === 'port') {
                    const portName = item.name;
                    const portArrivals = item.upcomingArrivals || [];
                    portArrivals.forEach(arr => {
                        arrivals.push({
                            ...arr,
                            portName: portName
                        });
                    });
                    if (item.scrapedAt) {
                        const t = new Date(item.scrapedAt).getTime();
                        if (t > lastScrapedTime) {
                            lastScrapedTime = t;
                        }
                    }
                }
            });

            // Determine if filtering by a single date parameter or displaying the full upcoming schedule
            const urlParams = new URLSearchParams(window.location.search);
            const dateParam = urlParams.get('date');
            let filteredArrivals = [];
            let isSingleDate = false;

            if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
                filteredArrivals = arrivals.filter(arr => arr.date === dateParam);
                isSingleDate = true;
            } else {
                // Default to displaying all upcoming arrivals for the rest of 2026 starting from Jamaica local date
                filteredArrivals = arrivals.filter(arr => arr.date >= targetDate);
                isSingleDate = false;
            }

            // Update KPI Labels and Column Headers dynamically based on view type
            const shipsLabelEl = document.querySelector('.ships .stat-label');
            const passengersLabelEl = document.querySelector('.passengers .stat-label');
            const portsLabelEl = document.querySelector('.ports .stat-label');
            const firstHeaderEl = document.querySelector('.arrivals-table th:first-child');

            if (isSingleDate) {
                if (shipsLabelEl) shipsLabelEl.textContent = 'Ships Today';
                if (passengersLabelEl) passengersLabelEl.textContent = 'Passengers Today';
                if (portsLabelEl) portsLabelEl.textContent = 'Ports Active';
                if (firstHeaderEl) firstHeaderEl.textContent = 'PORT';
            } else {
                if (shipsLabelEl) shipsLabelEl.textContent = 'Upcoming Ships';
                if (passengersLabelEl) passengersLabelEl.textContent = 'Upcoming Guests';
                if (portsLabelEl) portsLabelEl.textContent = 'Active Ports';
                if (firstHeaderEl) firstHeaderEl.textContent = 'DATE';
            }

            // Compute KPI Calculations
            const totalShips = filteredArrivals.length;
            let totalPassengers = 0;
            const activePortsSet = new Set();

            // Sort chronologically (if same day, by time; otherwise by date and then time)
            filteredArrivals.sort((a, b) => {
                if (a.date !== b.date) {
                    return a.date.localeCompare(b.date);
                }
                return timeToMinutes(a.arrivalTime) - timeToMinutes(b.arrivalTime);
            });

            filteredArrivals.forEach(arr => {
                const shipKey = (arr.shipName || '').toLowerCase().trim();
                const capacity = SHIP_CAPACITIES[shipKey] || 0;
                arr.Guests = capacity;
                arr.Status = calculateStatus(arr.arrivalTime, arr.departureTime, arr.date, targetDate);

                totalPassengers += capacity;
                if (arr.Status.toLowerCase().trim() !== 'cancelled') {
                    activePortsSet.add(cleanPortName(arr.portName));
                }
            });

            // Update KPI DOM Elements
            kpiShipsEl.textContent = totalShips;
            kpiPassengersEl.textContent = totalPassengers > 0 ? totalPassengers.toLocaleString('en-CA') : '0';
            kpiPortsEl.textContent = activePortsSet.size;

            // Update Last Updated KPI card and footer with current date today and latest sync time
            updateLastUpdatedTimestamp();

            // Render Table rows
            tableBodyEl.innerHTML = '';
            if (filteredArrivals.length === 0) {
                tableBodyEl.innerHTML = `
                    <tr class="loading-row">
                        <td colspan="6" style="padding: 50px; font-size: 20px; color: var(--text-muted);">
                            No cruise ship arrivals scheduled.
                        </td>
                    </tr>
                `;
                adjustTableContainerHeight();
                return;
            }

            filteredArrivals.forEach((arr) => {
                const tr = document.createElement('tr');
                const guestsFormatted = arr.Guests > 0 ? arr.Guests.toLocaleString('en-CA') : '---';
                const cleanedPort = cleanPortName(arr.portName);
                
                const firstColumnHTML = isSingleDate 
                    ? `<td class="${getPortClass(arr.portName)}">${cleanedPort.toUpperCase()}</td>`
                    : `<td class="${getPortClass(arr.portName)}">
                         <div style="font-weight: 700;">${formatDateDisplay(arr.date)}</div>
                         <div style="font-size: 16px; opacity: 0.85; font-weight: 600; margin-top: 4px;">${cleanedPort.toUpperCase()}</div>
                       </td>`;

                tr.innerHTML = `
                    ${firstColumnHTML}
                    <td>${formatTime12Hour(arr.arrivalTime)}</td>
                    <td style="font-weight: 700;">${arr.shipName}</td>
                    <td>${formatTime12Hour(arr.departureTime)}</td>
                    <td>${guestsFormatted}</td>
                    <td>${getStatusBadge(arr.Status)}</td>
                `;
                tableBodyEl.appendChild(tr);
            });

            // Adjust table container height after table populates
            adjustTableContainerHeight();

        } catch (error) {
            console.error('Error loading cruise schedule from Apify:', error);
            tableBodyEl.innerHTML = `
                <tr class="error-row">
                    <td colspan="6" style="padding: 50px; font-size: 20px; color: #ff5252;">
                        Error loading schedule data. Please check connection to Apify Console.
                    </td>
                </tr>
            `;
            adjustTableContainerHeight();
        }
    }

    // INITIALIZATION & TIMER REGISTRATION

    // Initialize timestamp immediately
    updateLastUpdatedTimestamp();

    // Initial data load
    fetchAndRenderData();

    // Register dynamic height adjustment on window resize
    window.addEventListener('resize', adjustTableContainerHeight);

    // Live clock in hero banner
    renderClock();
    setInterval(renderClock, 1000);

    // Register auto-refresh interval (60 minutes)
    setInterval(fetchAndRenderData, AUTO_REFRESH_INTERVAL);
});
