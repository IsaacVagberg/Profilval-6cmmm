// DOM Elements
const profileSelect = document.getElementById('profile-select');
const clearBtn = document.getElementById('clear-btn');
const themeToggle = document.getElementById('theme-toggle');
const saveBtn = document.getElementById('save-btn');
const scheduleBody = document.getElementById('schedule-body');
const oblList = document.getElementById('obl-courses');
const inrList = document.getElementById('inr-courses');
const valList = document.getElementById('val-courses');
const modalOverlay = document.getElementById('receipt-modal');
const modalClose = document.getElementById('modal-close');
const receiptInfo = document.getElementById('receipt-info');
const receiptList = document.getElementById('receipt-list');

// Data State
const PERIODS = ["T7-P1", "T7-P2", "T8-P1", "T8-P2", "T9-P1", "T9-P2", "T10-P1", "T10-P2"];
let currentProfile = "";
let courses = [];
let schedule = {}; // schedule[period][block] = [courseId1, courseId2]

// Filters
let filterTerm = "Alla";
let filterPeriod = "Alla";
let filterBlock = "Alla";
let filterAdv = false;
let filterMulti = false;

// Drag State
let draggedCourseId = null;
let dragSource = null; // 'list' or {period, block}

// Patchar datan direkt vid start (TMPR04 får finnas i alla block men behåller 4 som default)
function patchData() {
    const applyPatch = (c) => {
        if (c.id.startsWith("TMPR04")) {
            c.blocks = [1, 2, 3, 4];
            // Vi behåller c.defB intakt (som är 4 från data.js)
        }
    };
    Object.values(profilData).forEach(list => list.forEach(applyPatch));
    allCourses.forEach(applyPatch);
}

// Hjälpfunktion för att kolla om två kurser får ligga parallellt i samma ruta
function canBeParallel(course, targetPeriod, targetBlock) {
    if (!schedule[targetPeriod] || !schedule[targetPeriod][targetBlock]) return false;
    const existingIds = schedule[targetPeriod][targetBlock];

    if (existingIds.length === 0) return true; // Helt ledigt
    if (existingIds.length >= 2) return false; // Redan fullt (max 2)

    const existingObj = getCourse(existingIds[0]);
    if (existingObj && existingObj.fixed) return false; // Rör ej fasta kurser (exjobb)
    if (course.fixed) return false;

    // Minst en måste vara flerperiod (span)
    let isMulti = (existingObj && existingObj.span) || course.span;
    return isMulti;
}

// Initialize
function init() {
    patchData();

    // Fyll dropdown
    const profiles = Object.keys(profilData);
    profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        profileSelect.appendChild(opt);
    });

    profileSelect.addEventListener('change', (e) => loadProfile(e.target.value));
    clearBtn.addEventListener('click', clearSchedule);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    saveBtn.addEventListener('click', showReceiptModal);
    modalClose.addEventListener('click', () => modalOverlay.classList.add('hidden'));

    // Setup filter listeners
    const fTerm = document.getElementById('filter-term');
    const fPeriod = document.getElementById('filter-period');
    const fBlock = document.getElementById('filter-block');
    const fAdv = document.getElementById('filter-adv');
    const fMulti = document.getElementById('filter-multi');

    if (fTerm) fTerm.addEventListener('change', (e) => { filterTerm = e.target.value; renderLists(); });
    if (fPeriod) fPeriod.addEventListener('change', (e) => { filterPeriod = e.target.value; renderLists(); });
    if (fBlock) fBlock.addEventListener('change', (e) => { filterBlock = e.target.value; renderLists(); });
    if (fAdv) fAdv.addEventListener('change', (e) => { filterAdv = e.target.checked; renderLists(); });
    if (fMulti) fMulti.addEventListener('change', (e) => { filterMulti = e.target.checked; renderLists(); });

    // Typ-filter dropdown
    const fType = document.getElementById('course-type-filter');
    if (fType) fType.addEventListener('change', renderLists);

    const cFilterBtn = document.getElementById('clear-filter-btn');
    if (cFilterBtn) cFilterBtn.addEventListener('click', () => {
        filterTerm = "Alla"; filterPeriod = "Alla"; filterBlock = "Alla";
        filterAdv = false; filterMulti = false;
        if (fTerm) fTerm.value = "Alla";
        if (fPeriod) fPeriod.value = "Alla";
        if (fBlock) fBlock.value = "Alla";
        if (fAdv) fAdv.checked = false;
        if (fMulti) fMulti.checked = false;
        if (fType) fType.value = "ALL";
        renderLists();
    });

    buildTableStructure();

    // Theme initialization
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }

    // Ladda senast valda profil eller första
    const savedProfile = localStorage.getItem('lastProfile') || profiles[0];
    profileSelect.value = savedProfile;
    loadProfile(savedProfile);
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

function buildTableStructure() {
    scheduleBody.innerHTML = '';
    PERIODS.forEach(period => {
        const tr = document.createElement('tr');

        // Formatera namn
        const label = period.replace('-', ' ').replace('P', 'Period ').replace('T', 'Termin ');

        const th = document.createElement('td');
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const termMatch = period.split('-')[0];
            const periodMatch = period.split('-')[1];
            document.getElementById('filter-term').value = termMatch.replace('T', '');
            document.getElementById('filter-period').value = periodMatch.replace('P', '');
            document.getElementById('filter-block').value = "Alla";

            filterTerm = termMatch.replace('T', '');
            filterPeriod = periodMatch.replace('P', '');
            filterBlock = "Alla";

            renderLists();
        });
        th.innerHTML = `<div title="Klicka för att filtrera listan hit">${label}</div><small class="period-warning" id="warn-${period}"></small>`;
        tr.appendChild(th);

        for (let b = 1; b <= 4; b++) {
            const td = document.createElement('td');
            td.dataset.period = period;
            td.dataset.block = b;
            td.classList.add('dropzone');

            // Event listeners
            td.addEventListener('dragover', handleDragOver);
            td.addEventListener('dragleave', handleDragLeave);
            td.addEventListener('drop', handleDrop);
            td.addEventListener('click', () => handleEmptyCellClick(period, b));

            tr.appendChild(td);
        }
        scheduleBody.appendChild(tr);
    });
}

function loadProfile(pName) {
    currentProfile = pName;
    localStorage.setItem('lastProfile', pName);

    courses = JSON.parse(JSON.stringify(profilData[pName]));

    // Init tom schedule
    schedule = {};
    PERIODS.forEach(p => {
        schedule[p] = { 1: [], 2: [], 3: [], 4: [] };
    });

    const savedState = localStorage.getItem('schema_' + pName);
    if (savedState) {
        let parsed = JSON.parse(savedState);
        PERIODS.forEach(p => {
            for (let b = 1; b <= 4; b++) {
                if (parsed[p] && parsed[p][b] !== undefined) {
                    if (Array.isArray(parsed[p][b])) {
                        schedule[p][b] = parsed[p][b];
                    } else if (parsed[p][b] !== null) {
                        schedule[p][b] = [parsed[p][b]];
                    }
                }
            }
        });

        // Rensa dubbletter av Examensarbete i block 2-4
        ['T10-P1', 'T10-P2'].forEach(p => {
            for (let b = 2; b <= 4; b++) {
                schedule[p][b] = schedule[p][b].filter(id => !id.startsWith('TQXX33'));
            }
        });
    } else {
        // Auto-placera obligatoriska kurser som fallback vid nytt schema
        courses.filter(c => c.type === 'O').forEach(c => {
            if (c.defP && c.defB && c.defB !== '-') {
                if (canBeParallel(c, c.defP, c.defB)) {
                    schedule[c.defP][c.defB].push(c.id);
                }
            } else if (c.defP && (c.defB === '-' || (c.blocks && c.blocks.includes('-'))) && c.fixed) {
                if (canBeParallel(c, c.defP, 1)) schedule[c.defP][1].push(c.id);
            }
        });
    }

    renderAll();
}

function clearSchedule() {
    if (!confirm("Vill du rensa hela schemat för denna profil (inkl. obligatoriska kurser)?")) return;

    PERIODS.forEach(p => {
        schedule[p] = { 1: [], 2: [], 3: [], 4: [] };
    });

    courses.filter(c => c.type === 'O').forEach(c => {
        if (c.defP && c.defB && c.defB !== '-') {
            if (canBeParallel(c, c.defP, c.defB)) {
                schedule[c.defP][c.defB].push(c.id);
            }
        } else if (c.defP && (c.defB === '-' || (c.blocks && c.blocks.includes('-'))) && c.fixed) {
            if (canBeParallel(c, c.defP, 1)) schedule[c.defP][1].push(c.id);
        }
    });

    saveToLocal();
    renderAll();
}

function saveToLocal() {
    localStorage.setItem('schema_' + currentProfile, JSON.stringify(schedule));
}

// ---------------------------
// Rendering
// ---------------------------

function renderAll() {
    renderTable();
    renderLists();
    updateStats();
    saveToLocal();
}

function renderTable() {
    document.querySelectorAll('.dropzone').forEach(td => {
        td.innerHTML = '';
        td.className = 'dropzone';
        td.style.visibility = '';
    });

    ['T10-P1', 'T10-P2'].forEach(p => {
        for (let b = 2; b <= 4; b++) {
            schedule[p][b] = schedule[p][b].filter(id => !id.startsWith('TQXX33'));
        }
    });

    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            const courseIds = schedule[p][b];
            const td = document.querySelector(`td[data-period="${p}"][data-block="${b}"]`);

            if (td && courseIds.length > 0) {
                if (courseIds.length > 1) {
                    td.classList.add('parallel-cell');
                }
                courseIds.forEach(cid => {
                    const course = getCourse(cid);
                    if (course) {
                        let card = createCourseCard(course, true);
                        if (courseIds.length > 1) card.classList.add('parallel-card');
                        td.appendChild(card);
                    }
                });
            }
        }
    });

    // Visuell sammanslagning för syskonkurser (görs bara om rutan inte är parallel för att undvika grafikbuggar)
    PERIODS.forEach((p, index) => {
        if (index === PERIODS.length - 1) return;
        const nextP = PERIODS[index + 1];

        for (let b = 1; b <= 4; b++) {
            const idsTop = schedule[p][b];
            const idsBot = schedule[nextP][b];

            if (idsTop.length === 1 && idsBot.length === 1) {
                const baseTop = idsTop[0].split('_')[0];
                const baseBot = idsBot[0].split('_')[0];
                if (baseTop === baseBot) {
                    const topDiv = document.querySelector(`td[data-period="${p}"][data-block="${b}"] .course-card`);
                    const botDiv = document.querySelector(`td[data-period="${nextP}"][data-block="${b}"] .course-card`);
                    if (topDiv && botDiv) {
                        topDiv.style.borderBottomLeftRadius = '0';
                        topDiv.style.borderBottomRightRadius = '0';
                        topDiv.style.borderBottom = 'none';
                        botDiv.style.borderTopLeftRadius = '0';
                        botDiv.style.borderTopRightRadius = '0';
                        botDiv.style.borderTop = '1px dashed rgba(255,255,255,0.2)';
                        botDiv.style.marginTop = '-5px';
                    }
                }
            }
        }
    });

    // Examensarbetet
    ['T10-P1', 'T10-P2'].forEach(p => {
        const ids1 = schedule[p][1];
        if (ids1.length > 0 && ids1[0].startsWith('TQXX33')) {
            const card = document.querySelector(`td[data-period="${p}"][data-block="1"] .course-card`);
            if (card) card.classList.add('span-all-blocks');
            for (let b = 2; b <= 4; b++) {
                const tdEl = document.querySelector(`td[data-period="${p}"][data-block="${b}"]`);
                if (tdEl) tdEl.innerHTML = '';
            }
        }
    });
}

function handleEmptyCellClick(p, b) {
    if (schedule[p][b].length > 0) return;
    const termMatch = p.split('-')[0];
    const periodMatch = p.split('-')[1];

    document.getElementById('filter-term').value = termMatch.replace('T', '');
    document.getElementById('filter-period').value = periodMatch.replace('P', '');
    document.getElementById('filter-block').value = b;

    filterTerm = termMatch.replace('T', '');
    filterPeriod = periodMatch.replace('P', '');
    filterBlock = b.toString();

    renderLists();
}

function renderLists() {
    const allList = document.getElementById('all-courses');
    if (!allList) return;
    allList.innerHTML = '';

    const scheduledIds = new Set();
    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            schedule[p][b].forEach(id => scheduledIds.add(id));
        }
    });

    let fullList = [...courses];
    allCourses.forEach(gc => {
        if (!fullList.find(c => c.id === gc.id)) fullList.push(gc);
    });

    const typeFilter = document.getElementById("course-type-filter")?.value || "ALL";

    const sortedCourses = fullList.sort((a, b) => {
        const pA = a.type === 'O' ? 1 : (a.inriktning ? 2 : 3);
        const pB = b.type === 'O' ? 1 : (b.inriktning ? 2 : 3);
        if (pA !== pB) return pA - pB;
        return a.code.localeCompare(b.code);
    });

    sortedCourses.forEach(course => {
        if (scheduledIds.has(course.id)) return;
        if (course.id.endsWith('_2')) return; // Gömmer Del 2 i listan

        const cTerm = course.period ? course.period.split('-')[0].replace('T', '') : '';
        const cPer = course.period ? course.period.split('-')[1].replace('P', '') : '';

        if (filterTerm !== "Alla" && cTerm && cTerm !== filterTerm) return;
        if (filterPeriod !== "Alla" && cPer && cPer !== filterPeriod) return;

        const isFlexBlock = course.blocks.includes('-') || course.blocks.length === 0;
        if (filterBlock !== "Alla" && !isFlexBlock && !course.blocks.includes(Number(filterBlock))) return;
        if (filterAdv && !course.level.startsWith('A')) return;
        if (filterMulti && !course.span) return;

        if (typeFilter !== "ALL") {
            if (typeFilter === "O" && course.type !== "O") return;
            if (typeFilter === "V" && !course.inriktning) return;
            if (typeFilter === "F" && (course.type === "O" || course.inriktning)) return;
        }

        const card = createCourseCard(course, false);

        if (course.id.endsWith('_1')) {
            const siblingId = course.id.replace('_1', '_2');
            const sibling = getCourse(siblingId);
            const totalHp = sibling ? course.hp + sibling.hp : course.hp;
            const hpSpan = card.querySelector('.course-hp');
            if (hpSpan) hpSpan.textContent = `${totalHp} hp`;

            const nameSpan = card.querySelector('.course-name');
            if (nameSpan) {
                nameSpan.textContent = course.name.replace(' (Del 1)', '');
            }
        }

        allList.appendChild(card);
    });
}

function getCourseUrl(course) {
    const code = course.code || course.id.replace(/_[12](@.*)?$/, '');
    const period = course.defP || course.period || '';
    const term = period.split('-')[0];
    let suffix = '';
    if (term === 'T7') suffix = '/ht-2026#syllabus';
    else if (term === 'T8') suffix = '/vt-2026#syllabus';
    else if (term === 'T9') suffix = '/ht-2026#syllabus';
    else if (term === 'T10') suffix = '/vt-2026#syllabus';
    return `https://studieinfo.liu.se/kurs/${code}${suffix}`;
}

function createCourseCard(course, inSchedule) {
    const el = document.createElement('div');
    el.className = `course-card type-${course.type}`;
    if (!inSchedule) el.classList.add('list-mode');
    if (course.fixed) el.classList.add('fixed');
    else el.draggable = true;
    el.dataset.id = course.id;

    el.innerHTML = `
        <div class="course-header">
            <div style="flex: 1;">
                <span class="course-code" title="Möjliga block: ${course.blocks.join(', ')}">${course.code}</span>
                <span class="course-name" title="${course.name}">${course.name}</span>
            </div>
            <div style="display: flex; gap: 4px; align-items: flex-start; flex-shrink: 0; margin-top: 2px;">
                ${!inSchedule && course.span ? `<span class="badge-multi" title="Flerperiodskurs" style="font-size: 0.6rem; padding: 1px 3px;">★ 2P</span>` : ''}
                <span class="course-hp" style="font-size: 0.65rem;">${course.hp} hp</span>
            </div>
        </div>
        <div class="course-meta">
            <span style="color: #94a3b8;">${!inSchedule ? `P: ${course.defP || (course.period || '').replace('T', 'T').replace('-P', ' P')}` : ''}</span>
            <span style="opacity: 1; margin-left: 4px;">${inSchedule ? '' : ` B: ${course.blocks.join(',')}`}</span>
            <span style="margin-left: auto;">${course.level}</span>
        </div>
        <button class="remove-btn ${inSchedule && !course.fixed ? '' : 'hidden-btn'}" title="Ta bort">&times;</button>
    `;

    const rmBtn = el.querySelector('.remove-btn');
    if (rmBtn) {
        rmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromSchedule(course.id);
        });
    }

    if (!course.fixed) {
        el.addEventListener('dragstart', (e) => {
            draggedCourseId = course.id;
            let pCell = el.closest('td');
            if (pCell) {
                dragSource = { period: pCell.dataset.period, block: Number(pCell.dataset.block) };
            } else {
                dragSource = 'list';
            }
            e.dataTransfer.setData('text/plain', course.id);
            setTimeout(() => el.style.opacity = '0.5', 0);
        });

        el.addEventListener('dragend', (e) => {
            el.style.opacity = '1';
            draggedCourseId = null;
            dragSource = null;
            document.querySelectorAll('.dropzone').forEach(td => {
                td.classList.remove('valid-drop', 'invalid-drop');
            });
        });

        if (!inSchedule) {
            el.addEventListener('click', () => autoPlaceCourse(course));
        } else {
            let dragMoved = false;
            el.addEventListener('mousedown', () => { dragMoved = false; });
            el.addEventListener('mousemove', () => { dragMoved = true; });
            el.addEventListener('click', (e) => {
                if (dragMoved || e.target.closest('.remove-btn')) return;
                const url = getCourseUrl(course);
                window.open(url, '_blank', 'noopener,noreferrer');
            });
        }
    }

    return el;
}

// ---------------------------
// Drag & Drop & Action Logic
// ---------------------------

function handleDragOver(e) {
    e.preventDefault();
    const td = e.currentTarget;
    if (!draggedCourseId) return;

    const course = getCourse(draggedCourseId);
    if (isValidDrop(course, td.dataset.period, Number(td.dataset.block))) {
        td.classList.add('valid-drop');
        td.classList.remove('invalid-drop');
    } else {
        td.classList.add('invalid-drop');
        td.classList.remove('valid-drop');
        e.dataTransfer.dropEffect = 'none';
    }
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('valid-drop', 'invalid-drop');
}

function handleDrop(e) {
    e.preventDefault();
    const td = e.currentTarget;
    td.classList.remove('valid-drop', 'invalid-drop');

    const courseId = e.dataTransfer.getData('text/plain');
    if (!courseId) return;

    const course = getCourse(courseId);
    const targetPeriod = td.dataset.period;
    const targetBlock = Number(td.dataset.block);

    if (!isValidDrop(course, targetPeriod, targetBlock)) return;

    placeCourse(course, targetPeriod, targetBlock);
}

function isValidDrop(course, targetPeriod, targetBlock) {
    if (!course) return false;

    const isFlexBlock = course.blocks.includes('-') || course.blocks.length === 0;
    const validPeriods = [course.period, ...(course.altPeriods || [])].filter(Boolean);
    const periodOk = validPeriods.length === 0 || validPeriods.includes(targetPeriod);
    const isAltPeriod = course.period && course.period !== targetPeriod && (course.altPeriods || []).includes(targetPeriod);

    if (!periodOk) return false;

    // Validerar om kursen FÅR ligga i detta block
    if (!isAltPeriod && !isFlexBlock && !course.blocks.includes(targetBlock)) return false;

    const existing = schedule[targetPeriod][targetBlock];
    if (existing.includes(course.id)) return false;

    // Vi tillåter droppet (returnerar sant) oavsett om de blir parallella eller ska bytas ut, 
    // så länge blocket inte är överfullt (max 2). Logiken för swap/parallel sker i placeCourse.
    if (existing.length >= 2) return false;

    if (existing.length === 1) {
        let existingObj = getCourse(existing[0]);
        if (existingObj && existingObj.fixed) return false; // Fasta kurser går ej att skriva över/kombinera
    }

    return true;
}

function removeFromSchedule(courseId) {
    let course = getCourse(courseId);
    if (!course) return;

    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            schedule[p][b] = schedule[p][b].filter(id => id !== courseId);
        }
    });

    // Tar bort syskonet ur hela schemat oavsett var det ligger
    if (courseId.endsWith('_1') || courseId.endsWith('_2')) {
        let base = courseId.split('_')[0];
        let sibling = courseId.endsWith('_1') ? base + '_2' : base + '_1';
        PERIODS.forEach(p => {
            for (let b = 1; b <= 4; b++) {
                schedule[p][b] = schedule[p][b].filter(id => id !== sibling);
            }
        });
    }

    renderAll();
}

function getCourse(cid) {
    let cp = courses.find(c => c.id === cid);
    if (cp) return cp;
    return allCourses.find(c => c.id === cid);
}

function placeCourse(course, tPer, tBlock) {
    // Rensa källan om vi drar från schemat
    if (dragSource && dragSource !== 'list') {
        schedule[dragSource.period][dragSource.block] = schedule[dragSource.period][dragSource.block].filter(id => id !== course.id);
    }

    const existingIds = schedule[tPer][tBlock];

    if (existingIds.length > 0 && !existingIds.includes(course.id)) {
        let existingObj = getCourse(existingIds[0]);
        let isMulti = (existingObj && existingObj.span) || course.span;

        if (existingIds.length === 1 && isMulti) {
            // Parallellt (inget bråk, de trängs bara ihop)
            schedule[tPer][tBlock].push(course.id);
        } else {
            // Byter ut gamla kursen automatiskt om ingen är multi
            existingIds.forEach(id => removeFromSchedule(id));
            schedule[tPer][tBlock].push(course.id);
        }
    } else if (!existingIds.includes(course.id)) {
        schedule[tPer][tBlock].push(course.id);
    }

    // Auto-placera syskon 
    if (course.id.endsWith('_1')) {
        let siblingId = course.id.replace('_1', '_2');
        let sibling = getCourse(siblingId);

        let isSched = false;
        PERIODS.forEach(p => { for (let b = 1; b <= 4; b++) { if (schedule[p][b].includes(siblingId)) isSched = true; } });

        if (sibling && !isSched) {
            let nextPer = sibling.period;
            if (!nextPer) {
                let idx = PERIODS.indexOf(tPer);
                if (idx >= 0 && idx < PERIODS.length - 1) nextPer = PERIODS[idx + 1];
            }
            if (nextPer) autoPlaceCourse(sibling, true, nextPer);
        }
    } else if (course.id.endsWith('_2')) {
        let siblingId = course.id.replace('_2', '_1');
        let sibling = getCourse(siblingId);

        let isSched = false;
        PERIODS.forEach(p => { for (let b = 1; b <= 4; b++) { if (schedule[p][b].includes(siblingId)) isSched = true; } });

        if (sibling && !isSched) {
            let prevPer = sibling.period;
            if (!prevPer) {
                let idx = PERIODS.indexOf(tPer);
                if (idx > 0) prevPer = PERIODS[idx - 1];
            }
            if (prevPer) autoPlaceCourse(sibling, true, prevPer);
        }
    }

    renderAll();
}

function autoPlaceCourse(course, silent = false, forcedPeriod = null) {
    let p = forcedPeriod || course.period;
    if (!p) p = "T7-P1";

    const isFlexBlock = course.defB === '-' || course.blocks.includes('-') || course.blocks.length === 0;
    let found = false;

    if (!isFlexBlock) {
        // Prioriterar att lägga den i sitt default-block (ex. block 4 för TMPR04) 
        // Även om det ligger något där, går det bra ifall de är godkända för "parallell"
        if (course.defB && canBeParallel(course, p, course.defB) && course.blocks.includes(course.defB)) {
            placeCourse(course, p, course.defB);
            found = true;
        } else {
            // Fallback - prövar övriga block som kursen stöder
            for (let b of course.blocks) {
                if (canBeParallel(course, p, b)) {
                    placeCourse(course, p, b);
                    found = true;
                    break;
                }
            }
        }
    } else {
        // Flexibla kurser testar bara 1 till 4
        for (let b = 1; b <= 4; b++) {
            if (canBeParallel(course, p, b)) {
                placeCourse(course, p, b);
                found = true;
                break;
            }
        }
    }

    if (!found && !silent) {
        alert("Kunde inte autoplacera kursen. Alla kompatibla block för " + course.code + " i period " + p + " är fulla.");
    }
}


// ---------------------------
// Stats & Modal
// ---------------------------

function updateStats() {
    let tot = 0, adv = 0, tm = 0;

    PERIODS.forEach(p => {
        const warnEl = document.getElementById(`warn-${p}`);
        if (warnEl) warnEl.textContent = '';
    });

    let periodSums = {};

    PERIODS.forEach(p => {
        periodSums[p] = 0;
        for (let b = 1; b <= 4; b++) {
            const cids = schedule[p][b];
            cids.forEach(cid => {
                let c = getCourse(cid);
                if (c) {
                    tot += c.hp;
                    periodSums[p] += c.hp;
                    if (c.level && c.level.startsWith('A')) {
                        adv += c.hp;
                        if (c.code.startsWith('TM') || c.code.startsWith('TMP')) {
                            tm += c.hp;
                        }
                    }
                }
            });
        }
    });

    PERIODS.forEach(p => {
        const warnEl = document.getElementById(`warn-${p}`);
        if (warnEl) {
            warnEl.innerHTML = `<strong>${periodSums[p]} hp</strong>`;
            if (periodSums[p] > 15) {
                warnEl.classList.add('warning');
            } else {
                warnEl.classList.remove('warning');
            }
        }
    });

    updateProgressBar('total', tot, 120);
    updateProgressBar('advanced', adv, 90);
    updateProgressBar('tm', tm, 18);
}

function updateProgressBar(id, value, max) {
    const textEl = document.getElementById(`val-${id}`);
    const fillEl = document.getElementById(`prog-${id}`);
    const boxEl = document.getElementById(`stat-${id}`);

    if (!textEl || !fillEl || !boxEl) return;

    textEl.textContent = value;
    let pct = (value / max) * 100;
    if (pct > 100) pct = 100;
    fillEl.style.width = pct + '%';

    if (value >= max) {
        boxEl.classList.add('goal-reached');
    } else {
        boxEl.classList.remove('goal-reached');
    }
}

function showReceiptModal() {
    receiptList.innerHTML = '';

    let selectedCourses = [];
    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            const cids = schedule[p][b];
            cids.forEach(cid => {
                let obj = getCourse(cid);
                if (obj) {
                    let c = Object.assign({}, obj);
                    c.planP = p;
                    c.planB = b;
                    selectedCourses.push(c);
                }
            });
        }
    });

    receiptInfo.innerHTML = `
        <strong>Profil:</strong> ${currentProfile} <br>
        <strong>Totalt inplanerat:</strong> ${selectedCourses.reduce((sum, c) => sum + c.hp, 0)} hp
    `;

    let pureList = {};
    selectedCourses.forEach(c => {
        let base = c.id.split('_')[0];
        if (!pureList[base]) {
            pureList[base] = { ...c, name: c.name.replace(' (Del 1)', '').replace(' (Del 2)', '') };
            pureList[base].placements = [`${c.planP} (Block ${c.planB})`];
        } else {
            pureList[base].hp += c.hp;
            pureList[base].placements.push(`${c.planP} (Block ${c.planB})`);
        }
    });

    Object.values(pureList).sort((a, b) => a.planP.localeCompare(b.planP)).forEach(c => {
        const li = document.createElement('li');
        const plStr = c.placements.join(' + ');
        li.innerHTML = `
            <div>
                <strong>${c.code}</strong> ${c.name}
                <br><span style="font-size:0.75rem; color:#94a3b8;">Ligger i: ${plStr}</span>
            </div> 
            <span style="min-width:100px;text-align:right;">${c.hp} hp / ${c.level}</span>
        `;
        receiptList.appendChild(li);
    });

    if (window.html2canvas) {
        let schedElement = document.querySelector('.schedule-section');
        let wrapper = document.querySelector('.table-wrapper');
        let appCont = document.querySelector('.app-container');

        if (schedElement && wrapper) {
            const oldBodyH = document.body.style.height;
            const oldBodyOverflow = document.body.style.overflow;
            const oldSchedH = schedElement.style.height;
            const oldSchedMinH = schedElement.style.minHeight;
            const oldWrapperOverflow = wrapper.style.overflow;
            const oldContOverflow = appCont.style.overflow;
            const oldContHeight = appCont.style.height;

            document.body.style.height = "auto";
            document.body.style.overflow = "visible";
            appCont.style.overflow = "visible";
            appCont.style.height = "auto";
            wrapper.style.overflow = "visible";
            wrapper.style.maxHeight = "none";
            schedElement.style.height = "auto";
            schedElement.style.minHeight = "auto";
            schedElement.style.overflow = "visible";

            setTimeout(() => {
                html2canvas(schedElement, {
                    backgroundColor: document.body.classList.contains('light-mode') ? "#f8fafc" : "#020617",
                    scale: 2,
                    windowHeight: schedElement.scrollHeight + 200
                }).then(canvas => {
                    let link = document.createElement('a');
                    link.download = `Masterval_${currentProfile}.png`;
                    link.href = canvas.toDataURL();
                    link.click();

                    document.body.style.height = oldBodyH;
                    document.body.style.overflow = oldBodyOverflow;
                    schedElement.style.height = oldSchedH;
                    schedElement.style.minHeight = oldSchedMinH;
                    wrapper.style.overflow = oldWrapperOverflow;
                    wrapper.style.maxHeight = "";
                    appCont.style.overflow = oldContOverflow;
                    appCont.style.height = oldContHeight;
                    schedElement.style.overflow = "hidden";
                });
            }, 300);
        }
    } else {
        alert("Bildinspelning kunde inte laddas. Ett webbläsartillägg blockerar troligen html2canvas.");
    }
}

window.toggleList = function (listId, headerEl) {
    const list = document.getElementById(listId);
    if (list) {
        list.classList.toggle('hidden');
        const icon = headerEl.querySelector('.icon');
        if (list.classList.contains('hidden')) {
            icon.textContent = '►';
        } else {
            icon.textContent = '▼';
        }
    }
}

// Start
init();