// Environment Detection
let ipcRenderer;
let isElectron = false;

try {
    if (typeof require !== 'undefined') {
        const electron = require('electron');
        ipcRenderer = electron.ipcRenderer;
        isElectron = true;
    }
} catch (e) {
    console.log("Running in Web Mode");
}

// State
let appData = { grades: [] };
let adminMode = false;

// DOM Elements
const views = {
    shelf: document.getElementById('view-shelf'),
    detail: document.getElementById('view-detail')
};
const containerShelf = document.getElementById('shelf-container');
const containerChapterList = document.getElementById('chapter-list-container');
const btnAdminToggle = document.getElementById('nav-mode-toggle');
const adminIndicator = document.getElementById('admin-indicator');
const adminButtons = [
    document.getElementById('btn-add-book'),
    document.getElementById('btn-add-chapter')
];

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Start
    init();
});

async function loadData() {
    if (isElectron) {
        appData = await ipcRenderer.invoke('read-data');
    } else {
        // Web Mode: Fetch from relative path
        try {
            const response = await fetch('data/books.json?nocache=' + Date.now());
            if (response.ok) {
                appData = await response.json();
            } else {
                console.warn("Failed to load books.json");
                appData = { grades: [] };
            }
        } catch (e) {
            console.error("Web Data Load Error:", e);
            appData = { grades: [] };
        }
    }
    console.log("Loaded data:", appData);
}

async function saveData() {
    if (isElectron) {
        await ipcRenderer.invoke('write-data', appData);
    } else {
        // Web Mode: Cannot save to server without backend
        console.warn("Save disabled in Web Mode");
    }
}

function setupEventListeners() {
    // Navigation
    document.getElementById('nav-home').addEventListener('click', () => switchView('shelf'));
    document.getElementById('btn-back-shelf').addEventListener('click', () => switchView('shelf'));

    // Admin Toggle
    btnAdminToggle.addEventListener('click', () => {
        if (!isElectron) {
            alert("웹(NAS) 환경에서는 '조회'만 가능합니다.\n데이터 수정은 PC 프로그램에서 해주세요.");
            return;
        }

        adminMode = !adminMode;
        adminIndicator.textContent = adminMode ? "ON" : "OFF";
        adminIndicator.className = `badge ${adminMode ? 'on' : 'off'}`;

        // Show/Hide admin buttons
        adminButtons.forEach(btn => btn.style.display = adminMode ? 'inline-block' : 'none');

        // Re-render current view to show/hide edit controls
        if (views.shelf.classList.contains('active')) renderShelf();
        if (views.detail.classList.contains('active') && selectedBook) renderChapterList(selectedBook);
    });

    // Event Listeners for Management
    document.getElementById('btn-add-book').onclick = () => openModal('modal-add-book');
    document.getElementById('btn-add-chapter').onclick = () => openModal('modal-add-chapter');
}

function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    views[viewName].classList.add('active');
}

// --- Initialization ---
async function init() {
    await loadData();
    setupEventListeners();

    // Check for Deep Link parameters
    const params = new URLSearchParams(window.location.search);
    const linkedBookId = params.get('book');
    const linkedChapterIndex = params.get('chapter');

    if (linkedBookId) {
        // Deep Link Mode: Hide Sidebar & Admin tools for clean view
        document.body.classList.add('deep-link-mode');

        // Find Book across all grades
        let foundBook = null;
        for (const grade of appData.grades) {
            foundBook = grade.books.find(b => b.id === linkedBookId);
            if (foundBook) break;
        }

        if (foundBook) {
            openBook(foundBook);
            // Open specific chapter if requested
            if (linkedChapterIndex !== null) {
                // Wait for DOM update (simple timeout or modify renderChapterList to accept target)
                // Since openBook calls renderChapterList synchronously, we can just manipulate DOM now.
                const chapters = document.querySelectorAll('.chapter-item');
                if (chapters[linkedChapterIndex]) {
                    chapters[linkedChapterIndex].classList.add('open');
                    chapters[linkedChapterIndex].classList.add('target-chapter'); // Mark for isolation
                    chapters[linkedChapterIndex].scrollIntoView({ behavior: 'smooth' });
                }
            }
        } else {
            renderShelf();
        }
    } else {
        renderShelf();
    }
}

// --- State for Selection ---
let selectedBook = null;
let selectedChapter = null;
let editingVideoIndex = -1; // Track which video is being edited

// --- Renderer: Bookshelf ---
function renderShelf() {
    containerShelf.innerHTML = '';

    // Sort Grades: Elementary -> Middle -> High -> Others
    appData.grades.sort((a, b) => {
        const priority = name => {
            if (name.includes('초등')) return 1;
            if (name.includes('중학') || name.includes('중등')) return 2;
            if (name.includes('고등')) return 3;
            return 4; // Others
        };
        const pA = priority(a.name);
        const pB = priority(b.name);
        if (pA !== pB) return pA - pB;
        return a.name.localeCompare(b.name); // Alphabetical tie-break
    });

    // Refresh grade dropdown for modal
    const gradeSelect = document.getElementById('input-book-grade');
    gradeSelect.innerHTML = '';

    appData.grades.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade.id;
        option.textContent = grade.name;
        gradeSelect.appendChild(option);
    });
    // Add "New Grade" Option
    const newOption = document.createElement('option');
    newOption.value = "NEW_GRADE";
    newOption.textContent = "+ 새 학년 추가...";
    gradeSelect.appendChild(newOption);

    // Render Shelf Section
    appData.grades.forEach(grade => {
        // Skip empty grades if you want, but maybe keep them for adding?
        // Let's keep them so user can see what exists.

        const section = document.createElement('div');
        section.className = 'shelf-grade-section';

        const title = document.createElement('h3');
        title.className = 'grade-title';
        title.textContent = grade.name;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'shelf-grid';

        grade.books.forEach((book, bookIndex) => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.onclick = () => openBook(book);

            // Delete Button (Admin Mode)
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete-book admin-only';
            deleteBtn.innerHTML = '×';
            deleteBtn.style.display = adminMode ? 'flex' : 'none';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`'${book.title}' 문제집을 삭제하시겠습니까?`)) {
                    grade.books.splice(bookIndex, 1);
                    await saveData();
                    renderShelf();
                }
            };
            card.appendChild(deleteBtn);

            const cover = document.createElement('div');
            cover.className = 'book-cover';

            if (book.cover_image) {
                // Display Image
                cover.innerHTML = `<img src="${book.cover_image}" alt="${book.title}">`;
                cover.style.backgroundColor = 'transparent';
            } else {
                // Fallback Color
                cover.style.backgroundColor = book.cover_color || '#bdc3c7';
                cover.innerText = book.title.substring(0, 2);
            }

            const info = document.createElement('div');
            info.className = 'book-info';
            info.innerHTML = `<div class="book-title">${book.title}</div>`;

            card.appendChild(cover);
            card.appendChild(info);
            grid.appendChild(card);
        });

        section.appendChild(grid);
        containerShelf.appendChild(section);
    });

    // Input listener for New Grade
    gradeSelect.onchange = (e) => {
        const inputNew = document.getElementById('input-new-grade');
        if (e.target.value === 'NEW_GRADE') {
            inputNew.style.display = 'block';
            inputNew.focus();
        } else {
            inputNew.style.display = 'none';
        }
    }
}

// --- Renderer: Detail View ---
function openBook(book) {
    selectedBook = book;
    document.getElementById('detail-book-title').textContent = book.title;
    renderChapterList(book);
    switchView('detail');
}

function renderChapterList(book) {
    containerChapterList.innerHTML = '';

    book.chapters.forEach((chapter, cIndex) => {
        const item = document.createElement('div');
        item.className = 'chapter-item';

        // Auto-open if this is the chapter we are working on (or linked)
        if (chapter === selectedChapter) {
            item.classList.add('open');
        }

        const header = document.createElement('div');
        header.className = 'chapter-header';

        const titleSpan = document.createElement('span');
        // Add arrow icon based on state
        const arrow = document.createElement('span');
        arrow.textContent = '▶ ';
        arrow.style.marginRight = '5px';
        arrow.style.fontSize = '12px';
        arrow.style.display = 'inline-block'; // Required for transform
        arrow.style.transition = 'transform 0.2s'; // Smooth rotation
        arrow.className = 'chapter-arrow';

        titleSpan.appendChild(arrow);
        titleSpan.appendChild(document.createTextNode(chapter.name));
        header.appendChild(titleSpan);

        // Share Button (Link Icon)
        const btnShare = document.createElement('span');
        btnShare.innerHTML = '🔗'; // Link icon/emoji
        btnShare.className = 'btn-share-link';
        btnShare.title = '이 단원 링크 복사';
        btnShare.onclick = (e) => {
            e.stopPropagation();

            // Fix: Use GitHub URL if in Electron (PC App), otherwise use current URL
            let baseUrl;
            if (isElectron) {
                baseUrl = 'https://kug0115-cpu.github.io/kookmath/';
            } else {
                baseUrl = window.location.origin + window.location.pathname;
            }

            const url = `${baseUrl}?book=${book.id}&chapter=${cIndex}`;

            // Clipboard API might need secure context (https) or localhost
            // Fallback for file protocol
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                    alert('링크가 복사되었습니다!\n학생에게 이 주소를 보내주세요.');
                }).catch(err => {
                    prompt("Ctrl+C를 눌러 링크를 복사하세요:", url);
                });
            } else {
                prompt("Ctrl+C를 눌러 링크를 복사하세요:", url);
            }
        };
        header.appendChild(btnShare);

        header.onclick = () => {
            // Don't toggle if clicking share button (handled by stopPropagation, but safe measure)
            item.classList.toggle('open');
        };

        const list = document.createElement('div');
        list.className = 'video-list video-grid';

        chapter.videos.forEach((video, index) => {
            const vItem = document.createElement('div');
            vItem.className = 'video-item';
            // Visual indicator for missing link
            const hasLink = video.url && video.url.length > 0;
            if (hasLink) {
                vItem.classList.add('has-link'); // Add colored style
                vItem.title = `${video.problem_no}. ${video.title}`;
            } else {
                // vItem.style.borderStyle = 'dashed'; // Moved to CSS logic if wanted, but simpler to just not have has-link
                vItem.title = "링크 없음 (클릭하여 추가)";
            }
            vItem.innerHTML = `<span>${video.problem_no}</span>`;

            vItem.onclick = (e) => {
                e.stopPropagation();

                if (adminMode) {
                    // Edit Mode: Open Modal
                    openEditVideoModal(chapter, index);
                } else {
                    // Play Mode
                    if (hasLink) {
                        playVideo(video);
                        // Highlight active
                        document.querySelectorAll('.video-item').forEach(el => el.classList.remove('playing'));
                        vItem.classList.add('playing');
                    } else {
                        alert("이 문제에는 아직 동영상이 연결되지 않았습니다.");
                    }
                }
            };
            list.appendChild(vItem);
        });

        // "Add Video" Button (Only in Admin Mode)
        if (adminMode) {
            const addBtn = document.createElement('div');
            addBtn.className = 'video-item add-btn';
            addBtn.innerHTML = '+';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                openAddVideoModal(chapter);
            };
            list.appendChild(addBtn);
        }

        item.appendChild(header);
        item.appendChild(list);
        containerChapterList.appendChild(item);
    });
}

function playVideo(video) {
    const container = document.getElementById('video-container');
    const placeholder = document.getElementById('video-placeholder');
    const ytPlayer = document.getElementById('youtube-player');
    const localPlayer = document.getElementById('local-player');
    const titleLabel = document.getElementById('current-video-title');

    container.style.display = 'block';
    placeholder.style.display = 'none';
    titleLabel.textContent = `${video.problem_no}. ${video.title}`;

    // Stop previous
    ytPlayer.src = "";
    localPlayer.pause();

    if (video.type === 'youtube') {
        localPlayer.style.display = 'none';
        ytPlayer.style.display = 'block';
        // Ensure embed URL
        let url = video.url;
        if (url.includes('watch?v=')) {
            url = url.replace('watch?v=', 'embed/');
        } else if (url.includes('youtu.be/')) {
            url = url.replace('youtu.be/', 'youtube.com/embed/');
        }
        ytPlayer.src = url;
    } else if (video.type === 'file') {
        ytPlayer.style.display = 'none';
        localPlayer.style.display = 'block';
        localPlayer.src = video.url;
    }
}

// --- Management Logic (Modals) ---
const modalOverlay = document.getElementById('modal-overlay');

function openModal(id) {
    modalOverlay.style.display = 'flex';
    document.querySelectorAll('.modal-card').forEach(el => el.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

function closeModals() {
    modalOverlay.style.display = 'none';
    editingVideoIndex = -1; // Reset edit state
}

document.getElementById('btn-save-book').onclick = async () => {
    const gradeSelect = document.getElementById('input-book-grade');
    let gradeId = gradeSelect.value;
    const title = document.getElementById('input-book-title').value;
    const fileInput = document.getElementById('input-book-cover');

    if (!title) return alert('제목을 입력해주세요');

    let grade;

    // Handle New Grade
    if (gradeId === 'NEW_GRADE') {
        const newName = document.getElementById('input-new-grade').value;
        if (!newName) return alert('새 학년 이름을 입력해주세요');

        // Create new grade
        gradeId = 'grade_' + Date.now();
        grade = {
            id: gradeId,
            name: newName,
            books: []
        };
        appData.grades.push(grade);
    } else {
        grade = appData.grades.find(g => g.id === gradeId);
    }

    if (grade) {
        let coverPath = null;

        // Handle Image Upload
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            // Since we don't have full fs access here in pure renderer logic without exposing it,
            // we will use the absolute path directly for local app simplicity.
            // Electron's file input gives 'path' property on File object in some versions/settings,
            // but for security standard web File doesn't.
            // However, with nodeIntegration: true, we can just use file.path!
            if (file.path) {
                coverPath = file.path; // Store absolute path
            }
        }

        grade.books.push({
            id: 'book_' + Date.now(),
            title: title,
            cover_color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            cover_image: coverPath,
            chapters: []
        });
        await saveData();
        renderShelf();
        closeModals();

        // Clear inputs
        document.getElementById('input-book-title').value = '';
        document.getElementById('input-new-grade').value = '';
        document.getElementById('input-book-cover').value = '';
        document.getElementById('input-new-grade').style.display = 'none';

        // Reset select
        gradeSelect.value = gradeId;
    }
};

document.getElementById('btn-save-chapter').onclick = async () => {
    const title = document.getElementById('input-chapter-title').value;
    if (!title) return alert('단원명을 입력해주세요');

    if (selectedBook) {
        selectedBook.chapters.push({
            name: title,
            videos: []
        });
        await saveData();
        renderChapterList(selectedBook);
        closeModals();
        document.getElementById('input-chapter-title').value = '';
    }
};

function openAddVideoModal(chapter) {
    selectedChapter = chapter;
    editingVideoIndex = -1; // New Item

    // Auto-increment problem number estimate
    const nextNo = chapter.videos.length + 1;
    document.getElementById('input-video-no').value = nextNo;
    document.getElementById('input-video-title').value = '';
    document.getElementById('input-video-url').value = '';
    openModal('modal-add-video');
    document.getElementById('group-video-count').style.display = 'block'; // Show count input on new
    document.getElementById('input-video-count').value = 1;
}

function openEditVideoModal(chapter, index) {
    selectedChapter = chapter;
    editingVideoIndex = index;

    const video = chapter.videos[index];
    document.getElementById('input-video-no').value = video.problem_no;
    document.getElementById('input-video-title').value = video.title === `${video.problem_no}번 문제` ? '' : video.title; // clear default
    document.getElementById('input-video-url').value = video.url;

    openModal('modal-add-video');
    document.getElementById('group-video-count').style.display = 'none'; // Hide count input on edit
}

document.getElementById('btn-save-video').onclick = async () => {
    const noStart = parseInt(document.getElementById('input-video-no').value); // Start Number
    const title = document.getElementById('input-video-title').value;
    const url = document.getElementById('input-video-url').value;
    const count = parseInt(document.getElementById('input-video-count').value || 1);

    if (selectedChapter) {
        if (editingVideoIndex >= 0) {
            // Edit Mode: Single update
            selectedChapter.videos[editingVideoIndex] = {
                ...selectedChapter.videos[editingVideoIndex],
                problem_no: noStart,
                title: title || `${noStart}번 문제`,
                url: url
            };
        } else {
            // Add Mode: Handle Bulk Creation
            if (count > 1) {
                // Bulk Add loop
                for (let i = 0; i < count; i++) {
                    const currentNo = noStart + i;
                    selectedChapter.videos.push({
                        problem_no: currentNo,
                        title: `${currentNo}번 문제`, // Default title for bulk
                        type: 'youtube',
                        url: '' // Empty URL default
                    });
                }
            } else {
                // Single Add
                selectedChapter.videos.push({
                    problem_no: noStart,
                    title: title || `${noStart}번 문제`,
                    type: 'youtube', // Default
                    url: url
                });
            }
        }

        // Sort by number
        selectedChapter.videos.sort((a, b) => parseInt(a.problem_no) - parseInt(b.problem_no));

        await saveData();
        renderChapterList(selectedBook);
        closeModals();
    }
};
