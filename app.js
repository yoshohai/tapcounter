// app.js - Main application logic

(async function () {
    'use strict';

    // ===== DOM refs =====
    const tapBtn = document.getElementById('tap-btn');
    const tapCount = document.getElementById('tap-count');
    const minusBtn = document.getElementById('minus-btn');
    const menuToggle = document.getElementById('menu-toggle');
    const menuSheet = document.getElementById('menu-sheet');
    const dashboard = document.getElementById('dashboard');
    const dashboardClose = document.getElementById('dashboard-close');
    const barChart = document.getElementById('bar-chart');
    const counterList = document.getElementById('counter-list');
    const toast = document.getElementById('toast');
    const syncBadge = document.getElementById('sync-badge');
    const menuGdrive = document.getElementById('menu-gdrive');
    const menuBackup = document.getElementById('menu-backup');

    // GDrive dialog refs
    const gdriveDialogOverlay = document.getElementById('gdrive-dialog-overlay');
    const gdriveClientIdInput = document.getElementById('gdrive-client-id');
    const gdriveCancelBtn = document.getElementById('gdrive-cancel-btn');
    const gdriveConnectBtn = document.getElementById('gdrive-connect-btn');

    let current = null;

    // ===== Init =====
    async function init() {
        current = await DB.getCurrentCounter();
        if (!current) {
            current = await DB.addCounter();
        }
        render();
        updateGDriveUI();

        // Auto sync
        try {
            const savedClientId = localStorage.getItem('gdrive_custom_client_id');
            if (savedClientId) {
                await GDrive.syncOnOpen(savedClientId);
                if (GDrive.isConnected()) {
                    syncBadge.classList.add('show');
                    setTimeout(() => syncBadge.classList.remove('show'), 3000);
                }
            }
            // Refresh after sync in case data changed
            current = await DB.getCurrentCounter();
            render();
        } catch (e) {
            console.warn('Sync error:', e);
        }
    }

    function render() {
        if (!current) return;
        tapCount.textContent = current.value;
    }

    function updateGDriveUI() {
        const connected = GDrive.isConnected();
        if (connected) {
            menuGdrive.querySelector('span').textContent = 'Disconnect Drive';
            menuGdrive.querySelector('.icon').textContent = '🔗';
        } else {
            menuGdrive.querySelector('span').textContent = 'Connect Drive';
            menuGdrive.querySelector('.icon').textContent = '☁️';
        }
        // Show/hide backup button based on connection
        menuBackup.style.display = connected ? '' : 'none';
    }

    // ===== Toast =====
    let toastTimer = null;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ===== Tap =====
    tapBtn.addEventListener('click', async (e) => {
        if (!current) return;

        // Ripple
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        const rect = tapBtn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 0.5;
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        tapBtn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());

        // Pop animation
        tapCount.classList.add('pop');
        setTimeout(() => tapCount.classList.remove('pop'), 80);

        // Increment
        current.value++;
        render();
        await DB.updateCounter(current);
    });

    // ===== Minus =====
    minusBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!current || current.value <= 0) return;
        current.value--;
        render();
        await DB.updateCounter(current);
    });

    // ===== Menu =====
    let menuOpen = false;

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menuOpen = !menuOpen;
        menuSheet.classList.toggle('open', menuOpen);
        menuToggle.classList.toggle('open', menuOpen);
        menuToggle.textContent = menuOpen ? '＋' : '☰';
    });

    // Close menu on tap outside
    document.addEventListener('click', (e) => {
        if (menuOpen && !menuSheet.contains(e.target) && e.target !== menuToggle) {
            menuOpen = false;
            menuSheet.classList.remove('open');
            menuToggle.classList.remove('open');
            menuToggle.textContent = '☰';
        }
    });

    // ===== Dashboard =====
    document.getElementById('menu-dashboard').addEventListener('click', async () => {
        closeMenu();
        await renderDashboard();
        dashboard.classList.add('open');
    });

    dashboardClose.addEventListener('click', () => {
        dashboard.classList.remove('open');
    });

    async function renderDashboard() {
        const all = await DB.getAllCounters();

        // Sort by created_at desc
        all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // ---- Bar chart: aggregate by day ----
        const dayMap = {};
        for (const c of all) {
            const day = c.created_at.slice(0, 10); // YYYY-MM-DD
            dayMap[day] = (dayMap[day] || 0) + c.value;
        }

        // Also consider updated_at for counters that were tapped on different days
        // Simple approach: group by created date
        const days = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]));
        const maxVal = Math.max(...days.map(d => d[1]), 1);

        barChart.innerHTML = '';
        if (days.length === 0) {
            barChart.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:20px">No data yet</div>';
        } else {
            for (const [day, val] of days) {
                const col = document.createElement('div');
                col.className = 'bar-col';

                const valEl = document.createElement('div');
                valEl.className = 'bar-val';
                valEl.textContent = val;

                const bar = document.createElement('div');
                bar.className = 'bar';
                const height = Math.max(4, (val / maxVal) * 130);
                bar.style.height = '0px';
                setTimeout(() => { bar.style.height = height + 'px'; }, 50);

                const label = document.createElement('div');
                label.className = 'bar-label';
                const d = new Date(day + 'T00:00:00');
                label.textContent = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });

                col.appendChild(valEl);
                col.appendChild(bar);
                col.appendChild(label);
                barChart.appendChild(col);
            }
            // Scroll to the right (latest)
            setTimeout(() => {
                const scroll = document.getElementById('chart-scroll');
                scroll.scrollLeft = scroll.scrollWidth;
            }, 100);
        }

        // ---- Counter list ----
        counterList.innerHTML = '';
        for (const c of all) {
            const card = document.createElement('div');
            card.className = 'counter-card';

            const info = document.createElement('div');
            info.className = 'counter-info';

            const dateEl = document.createElement('div');
            dateEl.className = 'date';
            const created = new Date(c.created_at);
            dateEl.textContent = created.toLocaleDateString('en', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            info.appendChild(dateEl);

            const valEl = document.createElement('div');
            valEl.className = 'counter-value';
            valEl.textContent = c.value;

            card.appendChild(info);
            card.appendChild(valEl);

            counterList.appendChild(card);
        }
    }

    // ===== New Counter =====
    document.getElementById('menu-new').addEventListener('click', async () => {
        closeMenu();
        current = await DB.addCounter();
        render();
        showToast('New counter created');
    });

    // ===== Backup (to Google Drive) =====
    menuBackup.addEventListener('click', async () => {
        closeMenu();
        if (!GDrive.isConnected()) {
            showToast('Connect to Drive first');
            return;
        }
        try {
            showToast('Backing up to Drive...');
            const token = localStorage.getItem('gdrive_access_token');
            const all = await DB.getAllCounters();
            await GDrive.uploadBackup(token, all);
            showToast('Backed up to Drive ✓');
        } catch (e) {
            showToast('Backup failed');
            console.error(e);
        }
    });

    // ===== Google Drive =====
    menuGdrive.addEventListener('click', async () => {
        closeMenu();
        if (GDrive.isConnected()) {
            await GDrive.disconnectGDrive();
            updateGDriveUI();
            showToast('Disconnected from Drive');
        } else {
            // Check if we already have a client ID saved, otherwise prompt
            const savedClientId = localStorage.getItem('gdrive_custom_client_id');
            if (savedClientId) {
                gdriveClientIdInput.value = savedClientId;
            } else {
                gdriveClientIdInput.value = '';
            }
            gdriveDialogOverlay.classList.add('open');
            setTimeout(() => gdriveClientIdInput.focus(), 100);
        }
    });

    gdriveCancelBtn.addEventListener('click', () => {
        gdriveDialogOverlay.classList.remove('open');
    });

    gdriveDialogOverlay.addEventListener('click', (e) => {
        if (e.target === gdriveDialogOverlay) {
            gdriveDialogOverlay.classList.remove('open');
        }
    });

    gdriveConnectBtn.addEventListener('click', async () => {
        const clientId = gdriveClientIdInput.value.trim();
        if (!clientId) {
            showToast('Client ID is required');
            return;
        }

        gdriveDialogOverlay.classList.remove('open');
        localStorage.setItem('gdrive_custom_client_id', clientId);

        try {
            showToast('Connecting...');
            await GDrive.connectGDrive(clientId);
            // Refresh data after merge
            current = await DB.getCurrentCounter();
            render();
            updateGDriveUI();
            showToast('Connected to Drive');
        } catch (e) {
            showToast('Connection failed');
            console.error(e);
            // If it fails, maybe the client ID was wrong, remove it
            localStorage.removeItem('gdrive_custom_client_id');
        }
    });

    // ===== Helpers =====
    function closeMenu() {
        menuOpen = false;
        menuSheet.classList.remove('open');
        menuToggle.classList.remove('open');
        menuToggle.textContent = '☰';
    }

    // ===== Service Worker =====
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW reg failed:', e));
    }

    // ===== Start =====
    init();
})();
