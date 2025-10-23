document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'trello_clone_data_final_v2';
    const columnsMeta = [
        { id: 'todo', title: 'To Do'},
        { id: 'inprogress', title: 'In Progress'},
        { id: 'done', title: 'Done'}
    ];

    const btnToday = document.getElementById('btnToday');
    const btnFuture = document.getElementById('btnFuture');
    const btnPast = document.getElementById('btnPast');
    const board = document.getElementById('board');
    const modal = document.getElementById('modal');
    const openAddBtn = document.getElementById('openAddBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const taskForm = document.getElementById('taskForm');
    const clearAllBtn = document.getElementById('clearAll');
    const viewDateInput = document.getElementById('viewDate');
    const taskIdInput = document.getElementById('taskId');
    const taskTitleInput = document.getElementById('taskTitle');
    const taskDescInput = document.getElementById('taskDesc');
    const taskDueInput = document.getElementById('taskDue');
    const taskPriorityInput = document.getElementById('taskPriority');
    const statusSelect = document.getElementById('taskStatus');

    let state = { columns: {} };
    let currentView = 'today'; // 'today' | 'future' | 'past'
    let selectedDate = null;   // used for future/past views when date is chosen

    // helpers
    function todayStr() {
        return new Date().toISOString().split('T')[0];
    }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : { columns: {} };
      columnsMeta.forEach(c => (state.columns[c.id] ??= []));
    } catch (e) {
      state = { columns: {} };
      columnsMeta.forEach(c => (state.columns[c.id] = []));
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // UI helpers
  function setActiveButton() {
    btnToday.classList.remove('active'); btnFuture.classList.remove('active'); btnPast.classList.remove('active');
    btnToday.classList.remove('ghost'); btnFuture.classList.remove('ghost'); btnPast.classList.remove('ghost');

    if (currentView === 'today') {
      btnToday.classList.add('active');
      btnFuture.classList.add('ghost');
      btnPast.classList.add('ghost');
    } else if (currentView === 'future') {
      btnFuture.classList.add('active');
      btnToday.classList.add('ghost');
      btnPast.classList.add('ghost');
    } else {
      btnPast.classList.add('active');
      btnToday.classList.add('ghost');
      btnFuture.classList.add('ghost');
    }

    // date picker visibility
    if (currentView === 'today') {
      viewDateInput.classList.add('hidden');
      viewDateInput.value = '';
      selectedDate = null;
      openAddBtn.style.display = 'inline-block'; // add visible on today
    } else {
      viewDateInput.classList.remove('hidden');
      // Add visible only in future view
      openAddBtn.style.display = currentView === 'future' ? 'inline-block' : 'none';
    }
  }

  // Render board depending on view & selectedDate
  function render() {
    board.innerHTML = '';

    setActiveButton();

    if (currentView === 'today') {
      renderColumnsForDate(todayStr());
      return;
    }
    if ((currentView === 'future' || currentView === 'past') && !selectedDate) {
      // show a single informative panel asking user to pick date
      const infoCol = document.createElement('div');
      infoCol.className = 'column';
      infoCol.style.flex = '1 1 100%';
      const h = document.createElement('h3');
      h.className = 'col-title';
      h.textContent = currentView === 'future' ? 'Future — select a date' : 'Past — select a date';
      const drop = document.createElement('div');
      drop.className = 'drop-area';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Choose a date from the date picker to view tasks.';
      drop.appendChild(empty);
      infoCol.appendChild(h);
      infoCol.appendChild(drop);
      board.appendChild(infoCol);
      return;
    }

    // When a date is selected:
    if (currentView === 'future') {
      // show only To Do column for selectedDate
      renderColumnsForDate(selectedDate, { onlyTodo: true, editable: true, allowAdd: true });
    } else if (currentView === 'past') {
      // show all three columns but read-only (no edit/delete/drag)
      renderColumnsForDate(selectedDate, { readOnly: true });
    }
  }

  // Render columns filtered by date with options
  function renderColumnsForDate(dateStr, opts = {}) {
    const { onlyTodo = false, readOnly = false, allowAdd = false } = opts;

    const filteredColumns = columnsMeta.map(col => {
      const list = state.columns[col.id].filter(t => t.due === dateStr);
      return { ...col, items: list };
    });

    // If onlyTodo show only the todo column
    const colsToShow = onlyTodo ? filteredColumns.filter(c => c.id === 'todo') : filteredColumns;

    colsToShow.forEach(col => {
      const section = document.createElement('section');
      section.className = 'column';
      section.dataset.column = col.id;

      const h3 = document.createElement('h3');
      h3.className = 'col-title';
      h3.textContent = `${col.title} (${col.items.length})`;

      const drop = document.createElement('div');
      drop.className = 'drop-area';
      drop.dataset.column = col.id;

      // Only enable drag/drop in readOnly=false and only for main (today) view; for future/past we control in opts
      if (!readOnly && currentView === 'today') {
        drop.addEventListener('dragover', e => e.preventDefault());
        drop.addEventListener('drop', e => {
          e.preventDefault();
          try {
            const payload = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
            if (!payload.id || !payload.from) return;
            attemptMove(payload.id, payload.from, col.id);
          } catch {
            const id = e.dataTransfer.getData('taskId');
            const from = e.dataTransfer.getData('srcCol');
            if (id && from) attemptMove(id, from, col.id);
          }
        });
      }

      if (!col.items || col.items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No tasks';
        drop.appendChild(empty);
      } else {
        col.items.forEach(t => {
          const card = createCardElement(t, col.id, { readOnly, allowAdd });
          drop.appendChild(card);
        });
      }

      section.appendChild(h3);
      section.appendChild(drop);
      board.appendChild(section);
    });
  }

  // Create task card element with respect to mode
  function createCardElement(task, colId, opts = {}) {
    const { readOnly = false } = opts;
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = (!readOnly && currentView === 'today'); // draggable only in today main view
    card.dataset.id = task.id;

    if (card.draggable) {
      card.addEventListener('dragstart', e => {
        try {
          e.dataTransfer.setData('application/json', JSON.stringify({ id: task.id, from: colId }));
        } catch {
          e.dataTransfer.setData('taskId', task.id);
          e.dataTransfer.setData('srcCol', colId);
        }
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    }

    const title = document.createElement('h4'); title.textContent = task.title;
    const desc = document.createElement('p'); desc.textContent = task.description || '';

    const meta = document.createElement('div'); meta.className = 'meta';
    const dueSpan = document.createElement('span'); dueSpan.textContent = task.due || 'No due';
    const prioSpan = document.createElement('span'); prioSpan.className = `priority ${task.priority || 'medium'}`; prioSpan.textContent = task.priority || 'medium';
    meta.appendChild(dueSpan); meta.appendChild(prioSpan);

    const actions = document.createElement('div'); actions.className = 'actions';

    // Buttons visibility depends on view and readOnly
    // Today (full features): Start (todo), Done (not done), Edit, Delete
    // Future (editable but only todo column): Edit, Delete (no start/done)
    // Past (read-only): no action buttons, but show status badge

    if (currentView === 'today' && !readOnly) {
      if (colId === 'todo') {
        const startBtn = document.createElement('button'); startBtn.className = 'icon-btn'; startBtn.textContent = '▶';
        startBtn.title = 'Start'; startBtn.addEventListener('click', () => moveTask(task.id, 'todo', 'inprogress'));
        actions.appendChild(startBtn);
      }
      if (colId !== 'done') {
        const doneBtn = document.createElement('button'); doneBtn.className = 'icon-btn'; doneBtn.textContent = '✅';
        doneBtn.title = 'Mark Done'; doneBtn.addEventListener('click', () => markDone(task.id));
        actions.appendChild(doneBtn);
      }
      const editBtn = document.createElement('button'); editBtn.className = 'icon-btn'; editBtn.textContent = '✏';
      editBtn.title = 'Edit'; editBtn.addEventListener('click', () => openEditModal(task.id));
      actions.appendChild(editBtn);

      const delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
      delBtn.title = 'Delete'; delBtn.addEventListener('click', () => { if (confirm('Delete this task?')) deleteTask(task.id); });
      actions.appendChild(delBtn);
    } else if (currentView === 'future' && !readOnly) {
      // only editable To Do column shown in future; allow edit & delete
      const editBtn = document.createElement('button'); editBtn.className = 'icon-btn'; editBtn.textContent = '✏';
      editBtn.title = 'Edit'; editBtn.addEventListener('click', () => openEditModal(task.id));
      actions.appendChild(editBtn);

      const delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
      delBtn.title = 'Delete'; delBtn.addEventListener('click', () => { if (confirm('Delete this task?')) deleteTask(task.id); });
      actions.appendChild(delBtn);
    } else if (currentView === 'past' || readOnly) {
      // show status badge instead
      const status = document.createElement('span');
      status.className = 'status-badge';
      if (colId === 'done') { status.textContent = '✅ Completed'; status.classList.add('status-complete'); }
      else if (colId === 'inprogress') { status.textContent = '⏳ In Progress'; status.classList.add('status-inprogress'); }
      else { status.textContent = '📝 To Do'; status.classList.add('status-todo'); }
      actions.appendChild(status);
    }

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(meta);
    card.appendChild(actions);

    return card;
  }

  // Attempt move with allowed transitions
  function attemptMove(id, from, to) {
    // Only allow drag/drop in 'today' view
    if (currentView !== 'today') return;

    // same column
    if (from === to) return;

    // Allowed transitions:
    // todo -> inprogress
    // todo -> done
    // inprogress -> done
    const allowed = (from === 'todo' && (to === 'inprogress' || to === 'done')) ||
                    (from === 'inprogress' && to === 'done');

    if (!allowed) return;

    moveTask(id, from, to);
  }

  // CRUD functions
  function addTask(colId, task) {
    state.columns[colId].push(task);
    save();
    render();
  }

  function updateTask(id, updates) {
    for (const c of Object.keys(state.columns)) {
      const idx = state.columns[c].findIndex(t => t.id === id);
      if (idx > -1) {
        state.columns[c][idx] = { ...state.columns[c][idx], ...updates };
        save();
        render();
        return;
      }
    }
  }

  function deleteTask(id) {
    for (const c of Object.keys(state.columns)) {
      const idx = state.columns[c].findIndex(t => t.id === id);
      if (idx > -1) {
        state.columns[c].splice(idx, 1);
        save();
        render();
        return;
      }
    }
  }

  function moveTask(id, fromCol, toCol) {
    if (!state.columns[fromCol] || !state.columns[toCol]) return;
    const idx = state.columns[fromCol].findIndex(t => t.id === id);
    if (idx === -1) return;
    const [task] = state.columns[fromCol].splice(idx, 1);
    state.columns[toCol].push(task);
    save();
    render();
  }

  function markDone(id) {
    for (const c of Object.keys(state.columns)) {
      const idx = state.columns[c].findIndex(t => t.id === id);
      if (idx > -1) {
        const [task] = state.columns[c].splice(idx, 1);
        state.columns['done'].push(task);
        save();
        render();
        return;
      }
    }
  }

  function findTask(id) {
    for (const c of Object.keys(state.columns)) {
      const t = state.columns[c].find(x => x.id === id);
      if (t) return t;
    }
    return null;
  }

  // Modal handlers
  function openAddModal(prefill = {}) {
    modal.classList.remove('hidden');
    document.getElementById('modalTitle').textContent = 'Add Task';
    taskIdInput.value = '';
    taskTitleInput.value = prefill.title || '';
    taskDescInput.value = prefill.description || '';
    taskDueInput.value = prefill.due || (currentView === 'future' && selectedDate ? selectedDate : todayStr());
    taskPriorityInput.value = prefill.priority || 'medium';
    statusSelect.value = prefill.status || 'todo';
  }

  function openEditModal(id) {
    const t = findTask(id);
    if (!t) return;
    modal.classList.remove('hidden');
    document.getElementById('modalTitle').textContent = 'Edit Task';
    taskIdInput.value = t.id;
    taskTitleInput.value = t.title;
    taskDescInput.value = t.description || '';
    taskDueInput.value = t.due || todayStr();
    taskPriorityInput.value = t.priority || 'medium';
    statusSelect.value = getColumnOfTask(id) || 'todo';
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  function getColumnOfTask(id) {
    for (const c of Object.keys(state.columns)) {
      if (state.columns[c].some(t => t.id === id)) return c;
    }
    return null;
  }

  // Form submit
  taskForm.addEventListener('submit', e => {
    e.preventDefault();
    const id = taskIdInput.value.trim();
    const title = taskTitleInput.value.trim();
    const description = taskDescInput.value.trim();
    const due = taskDueInput.value;
    const priority = taskPriorityInput.value;
    const status = statusSelect.value;

    if (!title) return alert('Please enter a title');

    if (id) {
      // editing: update fields, may move between columns if status changed
      const current = getColumnOfTask(id);
      updateTask(id, { title, description, due, priority });
      if (current && current !== status) {
        moveTask(id, current, status);
      }
    } else {
      const task = {
        id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
        title,
        description,
        due,
        priority
      };
      addTask(status, task);
    }
    closeModal();
  });

  // View buttons
  btnToday.addEventListener('click', () => { currentView = 'today'; selectedDate = null; viewDateInput.value = ''; render(); });
  btnFuture.addEventListener('click', () => { currentView = 'future'; selectedDate = null; viewDateInput.value = ''; render(); });
  btnPast.addEventListener('click', () => { currentView = 'past'; selectedDate = null; viewDateInput.value = ''; render(); });

  // Datepicker handler for future/past views
  viewDateInput.addEventListener('change', () => {
    selectedDate = viewDateInput.value || null;
    render();
  });

  // Open add
  openAddBtn.addEventListener('click', () => {
    // only allow add in today or future views
    if (currentView === 'past') return;
    // prefill due if future view and date selected
    const prefill = {};
    if (currentView === 'future' && selectedDate) prefill.due = selectedDate;
    openAddModal(prefill);
  });

  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (!confirm('Clear all tasks?')) return;
      columnsMeta.forEach(c => (state.columns[c.id] = []));
      save();
      render();
    });
  }

  // Initial load & render
  load();
  render();
});