import {FetchArvanIPs, StartScan, StopScan} from '../wailsjs/go/main/App';
import {EventsOn} from '../wailsjs/runtime/runtime';

document.addEventListener('DOMContentLoaded', () => {
    const rangesList = document.getElementById('rangesList');
    const startBtn = document.getElementById('startBtn');
    const statusText = document.getElementById('statusText');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const resultsBody = document.getElementById('resultsBody');
    const copyBtn = document.getElementById('copyBtn');
    const pingMode = document.getElementById('pingMode');
    const sniGroup = document.getElementById('sniGroup');
    const toggleSelectBtn = document.getElementById('toggleSelectBtn');
    const refreshIpsBtn = document.getElementById('refreshIpsBtn');

    let healthyIPs = [];
    let currentSort = 'latency';
    let sortAsc = true;
    let isScanning = false;

    // Load initial config
    function loadIPs() {
        rangesList.innerHTML = '<div style="padding: 1rem; text-align: center;">در حال دریافت آی‌پی‌های جدید از سرور آروان... ⏳</div>';
        if (refreshIpsBtn) refreshIpsBtn.disabled = true;
        
        FetchArvanIPs().then(cidrs => {
            rangesList.innerHTML = '';
            cidrs.forEach(cidr => {
                const label = document.createElement('label');
                label.className = 'range-item';
                label.innerHTML = `<input type="checkbox" value="${cidr}"> <span dir="ltr">${cidr}</span>`;
                rangesList.appendChild(label);
            });
            if (refreshIpsBtn) refreshIpsBtn.disabled = false;
        }).catch(err => {
            rangesList.innerHTML = '<div style="color: red; padding: 1rem;">خطا در دریافت آی‌پی‌ها</div>';
            if (refreshIpsBtn) refreshIpsBtn.disabled = false;
        });
    }

    loadIPs();

    if (refreshIpsBtn) {
        refreshIpsBtn.addEventListener('click', loadIPs);
    }

    toggleSelectBtn.addEventListener('click', () => {
        const checkboxes = rangesList.querySelectorAll('input[type="checkbox"]');
        let allChecked = true;
        checkboxes.forEach(cb => {
            if (!cb.checked) allChecked = false;
        });

        // if all are checked, uncheck them. Otherwise, check all.
        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
        });
    });

    pingMode.addEventListener('change', () => {
        if (pingMode.value === 'tls') {
            sniGroup.style.display = 'block';
        } else {
            sniGroup.style.display = 'none';
        }
    });

    EventsOn('scan_start', () => {
        statusText.textContent = 'در حال اسکن...';
        startBtn.textContent = 'توقف ⏹';
        startBtn.className = 'btn-danger';
        isScanning = true;
        resultsBody.innerHTML = '';
        healthyIPs = [];
        progressBar.style.width = '0%';
    });

    EventsOn('scan_progress', (p) => {
        progressText.textContent = `${p.tested} / ${p.total}`;
        const pct = Math.min(100, Math.round((p.tested / p.total) * 100));
        progressBar.style.width = `${pct}%`;
    });

    EventsOn('scan_result', (r) => {
        healthyIPs.push(r);
        renderTable();
    });

    EventsOn('scan_done', () => {
        statusText.textContent = 'اسکن تمام شد یا متوقف شد!';
        startBtn.textContent = 'شروع اسکن 🚀';
        startBtn.className = 'btn-primary';
        startBtn.disabled = false;
        isScanning = false;
    });

    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.getAttribute('data-sort');
            if (currentSort === sortKey) {
                sortAsc = !sortAsc;
            } else {
                currentSort = sortKey;
                sortAsc = true;
            }
            
            document.querySelectorAll('th[data-sort] span.sort-icon').forEach(span => span.textContent = '');
            th.querySelector('span.sort-icon').textContent = sortAsc ? ' ↓' : ' ↑';
            
            renderTable();
        });
    });

    function renderTable() {
        healthyIPs.sort((a, b) => {
            let valA = a[currentSort];
            let valB = b[currentSort];
            
            if (currentSort === 'ip') {
                return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return sortAsc ? valA - valB : valB - valA;
            }
        });

        resultsBody.innerHTML = '';
        healthyIPs.forEach(r => {
            const tr = document.createElement('tr');
            let pingClass = 'ping-bad';
            if (r.latency < 100) pingClass = 'ping-good';
            else if (r.latency < 250) pingClass = 'ping-ok';
            
            tr.innerHTML = `
                <td dir="ltr">${r.ip}</td>
                <td class="${pingClass}" dir="ltr">${r.latency} ms</td>
                <td dir="ltr">${r.jitter} ms</td>
            `;
            resultsBody.appendChild(tr);
        });
    }

    startBtn.addEventListener('click', () => {
        if (isScanning) {
            startBtn.disabled = true;
            statusText.textContent = 'در حال توقف...';
            StopScan();
            return;
        }

        const checkboxes = rangesList.querySelectorAll('input:checked');
        const selectedCidrs = Array.from(checkboxes).map(cb => cb.value);
        const concurrency = parseInt(document.getElementById('concurrency').value);
        const mode = document.getElementById('pingMode').value;
        const sni = document.getElementById('sniHost').value;

        if (selectedCidrs.length === 0) {
            alert('حداقل یک رنج آی‌پی را انتخاب کنید.');
            return;
        }

        StartScan({
            cidrs: selectedCidrs,
            concurrency: concurrency,
            mode: mode,
            sni: sni
        });
    });

    copyBtn.addEventListener('click', () => {
        if (healthyIPs.length === 0) {
            alert('هنوز آی‌پی سالمی پیدا نشده است!');
            return;
        }
        const text = healthyIPs.map(r => r.ip).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            alert('تمام آی‌پی‌ها کپی شدند!');
        });
    });
});
