

// DOM Elements
const profileSelect = document.getElementById('profile-select');
const clearBtn = document.getElementById('clear-btn');
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
let schedule = {}; // schedule[period][block] = courseId

// Filters
let filterTerm = "Alla";
let filterPeriod = "Alla";
let filterBlock = "Alla";
let filterAdv = false;
let filterMulti = false;

// Drag State
let draggedCourseId = null;
let dragSource = null; // 'list' or {period, block}

// Initialize
function init() {
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

    // NYTT: Typ-filter dropdown
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

    // Ladda senast valda profil eller första
    const savedProfile = localStorage.getItem('lastProfile') || profiles[0];
    profileSelect.value = savedProfile;
    loadProfile(savedProfile);
}

function buildTableStructure() {
    scheduleBody.innerHTML = '';
    PERIODS.forEach(period => {
        const tr = document.createElement('tr');

        // Formatera namn
        const label = period.replace('-', ' ').replace('P', 'Period ').replace('T', 'Termin ');

        const th = document.createElement('td');
        // Klick på rubriken sätter filter till Termin och Period
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const termMatch = period.split('-')[0]; // T7
            const periodMatch = period.split('-')[1]; // P1
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

    // Klona data så vi har en fresh state
    courses = JSON.parse(JSON.stringify(profilData[pName]));

    // Init tom schedule
    schedule = {};
    PERIODS.forEach(p => {
        schedule[p] = { 1: null, 2: null, 3: null, 4: null };
    });

    // Ladda sparade val från localStorage
    const savedState = localStorage.getItem('schema_' + pName);
    if (savedState) {
        schedule = JSON.parse(savedState);
        // Rensa dubbletter av Examensarbete i block 2-4 efter laddning från localStorage
        ['T10-P1', 'T10-P2'].forEach(p => {
            for (let b = 2; b <= 4; b++) {
                if (schedule[p][b] && schedule[p][b].startsWith('TQXX33')) {
                    schedule[p][b] = null;
                }
            }
        });
    } else {
        // Auto-placera obligatoriska kurser som fallback
        courses.filter(c => c.type === 'O').forEach(c => {
            if (c.defP && c.defB && c.defB !== '-' && !schedule[c.defP][c.defB]) {
                schedule[c.defP][c.defB] = c.id;
            } else if (c.defP && (c.defB === '-' || (c.blocks && c.blocks.includes('-'))) && c.fixed) {
                // Kurs med flexibelt block och fixed=true: lägg bara i block 1
                if (!schedule[c.defP][1]) schedule[c.defP][1] = c.id;
            }
        });
    }

    renderAll();
}

function clearSchedule() {
    if (!confirm("Vill du rensa hela schemat för denna profil (inkl. obligatoriska kurser)?")) return;

    PERIODS.forEach(p => {
        schedule[p] = { 1: null, 2: null, 3: null, 4: null };
    });

    // Auto-placera obligatoriska kurser igen
    courses.filter(c => c.type === 'O').forEach(c => {
        if (c.defP && c.defB && c.defB !== '-' && !schedule[c.defP][c.defB]) {
            schedule[c.defP][c.defB] = c.id;
        } else if (c.defP && (c.defB === '-' || (c.blocks && c.blocks.includes('-'))) && c.fixed) {
            if (!schedule[c.defP][1]) schedule[c.defP][1] = c.id;
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
    // Töm först alla celler
    document.querySelectorAll('.dropzone').forEach(td => {
        td.innerHTML = '';
        td.className = 'dropzone'; // reset (removes exam-span-cell etc.)
        td.style.visibility = '';
    });

    // Rensa eventuella dubbletter av Examensarbete i block 2-4 (så vi bara räknar hp en gång)
    ['T10-P1', 'T10-P2'].forEach(p => {
        for (let b = 2; b <= 4; b++) {
            if (schedule[p][b] && schedule[p][b].startsWith('TQXX33')) {
                schedule[p][b] = null;
            }
        }
    });

    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            const courseId = schedule[p][b];
            if (courseId) {
                const course = getCourse(courseId);
                const td = document.querySelector(`td[data-period="${p}"][data-block="${b}"]`);
                if (course && td) {
                    td.appendChild(createCourseCard(course, true));
                }
            }
        }
    });

    // Visuell sammanslagning (span) för syskonkurser i samma block över perioder
    // Om T7-P1 och T7-P2 har samma kurs i samma block, ta bort margin/border mellan dem.
    PERIODS.forEach((p, index) => {
        if (index === PERIODS.length - 1) return; // ignore last
        const nextP = PERIODS[index + 1];

        for (let b = 1; b <= 4; b++) {
            const idTop = schedule[p][b];
            const idBot = schedule[nextP][b];
            if (idTop && idBot) {
                const baseTop = idTop.split('_')[0];
                const baseBot = idBot.split('_')[0];
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

    // Examensarbetet: sitter i block 1 men visuellt spänner över alla 4 block
    ['T10-P1', 'T10-P2'].forEach(p => {
        const exam1 = schedule[p][1];
        if (exam1 && exam1.startsWith('TQXX33')) {
            // Visa kortet i block 1 med span
            const card = document.querySelector(`td[data-period="${p}"][data-block="1"] .course-card`);
            if (card) card.classList.add('span-all-blocks');
            // Rensa innehåll i block 2-4 (men behåll default styling)
            for (let b = 2; b <= 4; b++) {
                const tdEl = document.querySelector(`td[data-period="${p}"][data-block="${b}"]`);
                if (tdEl) {
                    tdEl.innerHTML = '';
                    // inga extra klasser, behåll default td styling
                }
            }
        }
    });
}

function handleEmptyCellClick(p, b) {
    if (schedule[p][b]) return; // klicka inuti upptagen gör inget filter.
    const termMatch = p.split('-')[0]; // ex "T7"
    const periodMatch = p.split('-')[1]; // ex "P1"

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

    // Vilka ligger redan i schemat?
    const scheduledIds = new Set();
    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            if (schedule[p][b]) scheduledIds.add(schedule[p][b]);
        }
    });

    // Bygg komplett lista
    let fullList = [...courses];

    allCourses.forEach(gc => {
        let exists = fullList.find(c => c.id === gc.id);
        if (!exists) {
            fullList.push(gc);
        }
    });

    const typePriority = { 'O': 1, 'V': 2, 'F': 3 };
    const sortedCourses = fullList.sort((a, b) => {
        // Först prioritera efter typ/inriktning
        const pA = a.type === 'O' ? 1 : (a.inriktning ? 2 : 3);
        const pB = b.type === 'O' ? 1 : (b.inriktning ? 2 : 3);

        if (pA !== pB) return pA - pB;
        // Sedan bokstavsordning på kod
        return a.code.localeCompare(b.code);
    });

    // 🔥 NYTT FILTER (dropdown)
    const typeFilter = document.getElementById("course-type-filter").value;

    sortedCourses.forEach(course => {
        if (scheduledIds.has(course.id)) return;

        const isDel2 = course.id.endsWith('_2');
        if (isDel2) return;

        // Filter (din gamla logik)
        const cTerm = course.period ? course.period.split('-')[0].replace('T', '') : '';
        const cPer = course.period ? course.period.split('-')[1].replace('P', '') : '';

        if (filterTerm !== "Alla" && cTerm && cTerm !== filterTerm) return;
        if (filterPeriod !== "Alla" && cPer && cPer !== filterPeriod) return;
        // Blockfilter: hoppa över om kursen har flexibelt block ("-")
        const isFlexBlock = course.blocks.includes('-') || course.blocks.length === 0;
        if (filterBlock !== "Alla" && !isFlexBlock && !course.blocks.includes(Number(filterBlock))) return;

        // Filter: Avancerad nivå (A) — level börjar med 'A'
        if (filterAdv && !course.level.startsWith('A')) return;

        // Filter: Flerperiodskurser — har span-property
        if (filterMulti && !course.span) return;

        // 🔥 NYTT: typ-filter
        if (typeFilter !== "ALL") {
            if (typeFilter === "O" && course.type !== "O") return;
            if (typeFilter === "V" && !course.inriktning) return;
            if (typeFilter === "F" && (course.type === "O" || course.inriktning)) return;
        }

        const card = createCourseCard(course, false);

        if (course.id.endsWith('_1')) {
            // Visa kombinerad HP för hela kursen i listan
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
    const term = period.split('-')[0]; // e.g. "T7", "T8", "T9", "T10"
    let suffix = '';
    if (term === 'T7') suffix = '/ht-2026#syllabus';
    else if (term === 'T8') suffix = '/vt-2026#syllabus';
    else if (term === 'T9') suffix = '/ht-2026#syllabus';
    else if (term === 'T10') suffix = '/vt-2026#syllabus';
    // T10 and others: no suffix
    return `https://studieinfo.liu.se/kurs/${code}${suffix}`;
}

function createCourseCard(course, inSchedule) {
    const el = document.createElement('div');
    el.className = `course-card type-${course.type}`;
    if (!inSchedule) el.classList.add('list-mode');

    // Fixed?
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

    // Click on x
    const rmBtn = el.querySelector('.remove-btn');
    if (rmBtn) {
        rmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromSchedule(course.id);
        });
    }

    // Drag events
    if (!course.fixed) {
        el.addEventListener('dragstart', (e) => {
            draggedCourseId = course.id;
            // Bestäm källa
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

        // Click från lista lägger in automatiskt
        if (!inSchedule) {
            el.addEventListener('click', () => {
                autoPlaceCourse(course);
            });
        } else {
            // Click i schemat öppnar kurssidan – men bara vid äkta klick (ej drag)
            let dragMoved = false;
            el.addEventListener('mousedown', () => { dragMoved = false; });
            el.addEventListener('mousemove', () => { dragMoved = true; });
            el.addEventListener('click', (e) => {
                if (dragMoved) return;
                if (e.target.closest('.remove-btn')) return;
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
    e.preventDefault(); // Nödvändig för drop
    const td = e.currentTarget;
    if (!draggedCourseId) return;

    const course = courses.find(c => c.id === draggedCourseId);
    if (isValidDrop(course, td.dataset.period, Number(td.dataset.block))) {
        td.classList.add('valid-drop');
        td.classList.remove('invalid-drop');
    } else {
        td.classList.add('invalid-drop');
        td.classList.remove('valid-drop');
        e.dataTransfer.dropEffect = 'none'; // förbjud visuellt
    }
}

function handleDragLeave(e) {
    const td = e.currentTarget;
    td.classList.remove('valid-drop', 'invalid-drop');
}

function handleDrop(e) {
    e.preventDefault();
    const td = e.currentTarget;
    td.classList.remove('valid-drop', 'invalid-drop');

    const courseId = e.dataTransfer.getData('text/plain');
    if (!courseId) return;

    const course = courses.find(c => c.id === courseId);
    const targetPeriod = td.dataset.period;
    const targetBlock = Number(td.dataset.block);

    if (!isValidDrop(course, targetPeriod, targetBlock)) {
        return; // avbryt
    }

    placeCourse(course, targetPeriod, targetBlock);
}

function isValidDrop(course, targetPeriod, targetBlock) {
    if (!course) return false;

    const isFlexBlock = course.blocks.includes('-') || course.blocks.length === 0;

    // Kolla om targetPeriod är antingen kursens standard-period eller en alternativ period
    const validPeriods = [course.period, ...(course.altPeriods || [])].filter(Boolean);
    const periodOk = validPeriods.length === 0 || validPeriods.includes(targetPeriod);

    // Vid alternativperiod: tillåt vilket block som helst (1-4) eftersom ordinarie block kanske inte finns
    const isAltPeriod = course.period && course.period !== targetPeriod && (course.altPeriods || []).includes(targetPeriod);

    if (!periodOk) return false;

    // Blockvalidering — hoppa över för alternativperioder (fritt block)
    if (!isAltPeriod) {
        if (!isFlexBlock && !course.blocks.includes(targetBlock)) return false;
    }

    // Om det redan ligger en kurs här
    const existing = schedule[targetPeriod][targetBlock];
    if (existing && existing !== course.id) {
        let existingObj = courses.find(c => c.id === existing);
        if (existingObj && existingObj.fixed) return false;
    }

    return true;
}

function removeFromSchedule(courseId) {
    let course = courses.find(c => c.id === courseId);
    // Ta bort från schema state
    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            if (schedule[p][b] === courseId) schedule[p][b] = null;
        }
    });

    // Om det är en del-kurs, flytta dess syskon också
    if (courseId.endsWith('_1') || courseId.endsWith('_2')) {
        let base = courseId.split('_')[0];
        let sibling = courseId.endsWith('_1') ? base + '_2' : base + '_1';
        PERIODS.forEach(p => {
            for (let b = 1; b <= 4; b++) {
                if (schedule[p][b] === sibling) schedule[p][b] = null;
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
    // Ta bort existerande position för denna
    if (dragSource && dragSource !== 'list') {
        schedule[dragSource.period][dragSource.block] = null;
    }

    const existingId = schedule[tPer][tBlock];

    // Swap logik
    if (existingId && existingId !== course.id) {
        if (!confirm(`Cellen är upptagen av ${existingId}. Vill du ersätta den och flytta tillbaka den gamla?`)) {
            // Restore origin
            if (dragSource && dragSource !== 'list') schedule[dragSource.period][dragSource.block] = course.id;
            return;
        }
        removeFromSchedule(existingId);
    }

    schedule[tPer][tBlock] = course.id;

    // Syskonlogik för span: Om man droppar _1, försök tvinga _2
    if (course.id.endsWith('_1')) {
        let siblingId = course.id.replace('_1', '_2');
        let sibling = getCourse(siblingId);
        if (sibling) {
            let nextPer = sibling.period;
            if (!nextPer) {
                let idx = PERIODS.indexOf(tPer);
                if (idx >= 0 && idx < PERIODS.length - 1) nextPer = PERIODS[idx + 1];
            }
            if (nextPer) {
                const sibFlex = sibling.defB === '-' || sibling.blocks.includes('-') || sibling.blocks.length === 0;
                let siblingBlock = sibFlex ? null : (sibling.defB || sibling.blocks[0]);

                if (sibFlex) {
                    for (let b = 1; b <= 4; b++) {
                        if (!schedule[nextPer][b]) { siblingBlock = b; break; }
                    }
                }

                if (siblingBlock && !schedule[nextPer][siblingBlock]) {
                    schedule[nextPer][siblingBlock] = sibling.id;
                } else if (!sibFlex) {
                    for (let b of sibling.blocks) {
                        if (b !== '-' && !schedule[nextPer][b]) {
                            schedule[nextPer][b] = sibling.id;
                            break;
                        }
                    }
                }
            }
        }
    } else if (course.id.endsWith('_2')) {
        let siblingId = course.id.replace('_2', '_1');
        let sibling = getCourse(siblingId);
        if (sibling) {
            let prevPer = sibling.period;
            if (!prevPer) {
                let idx = PERIODS.indexOf(tPer);
                if (idx > 0) prevPer = PERIODS[idx - 1];
            }
            if (prevPer) {
                const sibFlex = sibling.defB === '-' || sibling.blocks.includes('-') || sibling.blocks.length === 0;
                let siblingBlock = sibFlex ? null : (sibling.defB || sibling.blocks[0]);

                if (sibFlex) {
                    for (let b = 1; b <= 4; b++) {
                        if (!schedule[prevPer][b]) { siblingBlock = b; break; }
                    }
                }

                if (siblingBlock && !schedule[prevPer][siblingBlock]) {
                    schedule[prevPer][siblingBlock] = sibling.id;
                }
            }
        }
    }

    renderAll();
}

function autoPlaceCourse(course, silent = false, forcedPeriod = null) {
    let p = forcedPeriod || course.period;
    if (!p) p = "T7-P1";

    const isFlexBlock = course.defB === '-' || course.blocks.includes('-') || course.blocks.length === 0;

    // Hitta första lediga block som är godkänt
    let found = false;

    if (!isFlexBlock) {
        // Normal logic: default block först, sedan valfria
        if (course.defB && !schedule[p][course.defB] && course.blocks.includes(course.defB)) {
            placeCourse(course, p, course.defB);
            found = true;
        } else {
            for (let b of course.blocks) {
                if (!schedule[p][b]) {
                    placeCourse(course, p, b);
                    found = true;
                    break;
                }
            }
        }
    } else {
        // Flex-block: sök igenom block 1-4 och tag första lediga
        for (let b = 1; b <= 4; b++) {
            if (!schedule[p][b]) {
                placeCourse(course, p, b);
                found = true;
                break;
            }
        }
    }

    if (!found && !silent) {
        alert("Kunde inte autoplacera kursen. Alla block för " + course.code + " i period " + p + " är fulla.");
    }
}


// ---------------------------
// Stats & Modal
// ---------------------------

function updateStats() {
    let tot = 0, adv = 0, tm = 0;

    // Reset period varningar
    PERIODS.forEach(p => {
        const warnEl = document.getElementById(`warn-${p}`);
        if (warnEl) warnEl.textContent = '';
    });

    let periodSums = {};

    PERIODS.forEach(p => {
        periodSums[p] = 0;
        for (let b = 1; b <= 4; b++) {
            const cid = schedule[p][b];
            if (cid) {
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
            }
        }
    });

    // Check varningar
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
    let totalHp = 0;

    let selectedCourses = [];
    PERIODS.forEach(p => {
        for (let b = 1; b <= 4; b++) {
            const cid = schedule[p][b];
            if (cid) {
                let obj = getCourse(cid);
                if (obj) {
                    let c = Object.assign({}, obj);
                    c.planP = p;
                    c.planB = b;
                    selectedCourses.push(c);
                }
            }
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

    // Vi döljer modalen efter användarens input: "behöver inte det inte komma en pop up. Utan den kan ladda ner dirket"
    // modalOverlay.classList.remove('hidden');

    if (window.html2canvas) {
        // Temporarily expand table for full screenshot
        let schedElement = document.querySelector('.schedule-section');
        let wrapper = document.querySelector('.table-wrapper');
        let appCont = document.querySelector('.app-container');

        if (schedElement && wrapper) {
            // Backup old styles
            const oldBodyH = document.body.style.height;
            const oldBodyOverflow = document.body.style.overflow;
            const oldSchedH = schedElement.style.height;
            const oldSchedMinH = schedElement.style.minHeight;
            const oldWrapperOverflow = wrapper.style.overflow;
            const oldContOverflow = appCont.style.overflow;
            const oldContHeight = appCont.style.height;

            // Expand strictly
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
                    backgroundColor: "#0f172a",
                    scale: 2,
                    windowHeight: schedElement.scrollHeight + 200 // Allow reading full height natively
                }).then(canvas => {
                    let link = document.createElement('a');
                    link.download = `Masterval_${currentProfile}.png`;
                    link.href = canvas.toDataURL();
                    link.click();

                    // Revert styles
                    document.body.style.height = oldBodyH;
                    document.body.style.overflow = oldBodyOverflow;
                    schedElement.style.height = oldSchedH;
                    schedElement.style.minHeight = oldSchedMinH;
                    wrapper.style.overflow = oldWrapperOverflow;
                    wrapper.style.maxHeight = ""; // clear
                    appCont.style.overflow = oldContOverflow;
                    appCont.style.height = oldContHeight;
                    schedElement.style.overflow = "hidden";
                });
            }, 300); // Längre timeout för reflow
        }
    } else {
        alert("Bildinspelning kunde inte laddas. Ett webbläsartillägg blockerar troligen html2canvas.");
    }
}

// Accordion-funktion för sidomenyn
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
