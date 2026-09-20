(function () {
  "use strict";

  var STORAGE_KEY = "smart-calendar-state-v1";
  var EVENT_COLORS = ["#2f5d50", "#b4483d", "#b9822f", "#4f6f8f", "#8a5f4d"];

  var state = {
    selectedDate: "",
    cursor: null,
    tasks: []
  };

  var els = {};
  var activeTaskId = null;
  var selectedColor = null;
  var pendingTask = null;
  var suppressTaskClick = false;
  var lastMonthChange = 0;
  var touchStartY = null;
  var pendingPlan = null;
  var recognition = null;
  var listening = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    state = loadState();

    if (!state.tasks.length) {
      state.tasks = createSeedTasks().map(normalizeTask);
      saveState();
    } else {
      state.tasks = state.tasks.map(normalizeTask);
    }

    state.selectedDate = toDateKey(new Date());
    state.cursor = startOfMonth(new Date());
    bindEvents();
    applyTheme();
    renderMonth();
    renderTaskPanel(state.selectedDate);
  }

  function cacheElements() {
    els.monthGrid = document.getElementById("month-grid");
    els.monthLabel = document.getElementById("month-label");
    els.prevMonth = document.getElementById("prev-month");
    els.nextMonth = document.getElementById("next-month");
    els.themeButton = document.getElementById("theme-button");
    els.calendarViewport = document.getElementById("calendar-viewport");
    els.swipeHint = document.getElementById("swipe-hint");
    els.fabAdd = document.getElementById("fab-add");
    els.taskPanel = document.getElementById("task-panel");
    els.taskPanelDate = document.getElementById("task-panel-date");
    els.taskPanelCount = document.getElementById("task-panel-count");
    els.taskPanelList = document.getElementById("task-panel-list");
    els.taskModal = document.getElementById("task-modal");
    els.modalTitle = document.getElementById("task-modal-title");
    els.modalClose = document.getElementById("modal-close");
    els.taskTitle = document.getElementById("task-title");
    els.taskDate = document.getElementById("task-date");
    els.taskAllDay = document.getElementById("task-all-day");
    els.timeFields = document.getElementById("time-fields");
    els.taskStart = document.getElementById("task-start");
    els.taskEnd = document.getElementById("task-end");
    els.taskPriority = document.getElementById("task-priority");
    els.colorSwatches = document.getElementById("color-swatches");
    els.taskNotes = document.getElementById("task-notes");
    els.taskCompleted = document.getElementById("task-completed");
    els.taskDelete = document.getElementById("task-delete");
    els.taskCancel = document.getElementById("task-cancel");
    els.taskSave = document.getElementById("task-save");
    els.conflictModal = document.getElementById("conflict-modal");
    els.conflictClose = document.getElementById("conflict-close");
    els.conflictCancel = document.getElementById("conflict-cancel");
    els.conflictKeep = document.getElementById("conflict-keep");
    els.conflictList = document.getElementById("conflict-list");
    els.conflictOptions = document.getElementById("conflict-options");
    els.addMenuModal = document.getElementById("add-menu-modal");
    els.addMenuClose = document.getElementById("add-menu-close");
    els.addGoalOption = document.getElementById("add-goal-option");
    els.addTaskOption = document.getElementById("add-task-option");
    els.goalModal = document.getElementById("goal-modal");
    els.goalClose = document.getElementById("goal-close");
    els.goalTitleInput = document.getElementById("goal-title-input");
    els.goalTimeInput = document.getElementById("goal-time-input");
    els.goalGenerateBtn = document.getElementById("goal-generate-btn");
    els.goalPreview = document.getElementById("goal-preview");
    els.quickModal = document.getElementById("quick-task-modal");
    els.quickClose = document.getElementById("quick-close");
    els.quickTaskInput = document.getElementById("quick-task-input");
    els.quickGenerateBtn = document.getElementById("quick-generate-btn");
    els.quickPreview = document.getElementById("quick-preview");
    els.chatPanel = document.getElementById("chat-panel");
    els.chatClose = document.getElementById("chat-close");
    els.chatMessages = document.getElementById("chat-messages");
    els.planCard = document.getElementById("plan-card");
    els.chatMic = document.getElementById("chat-mic");
    els.chatInput = document.getElementById("chat-input");
    els.chatSend = document.getElementById("chat-send");
    els.toast = document.getElementById("toast");
  }

  function bindEvents() {
    els.prevMonth.addEventListener("click", function () {
      changeMonth(-1);
    });
    els.nextMonth.addEventListener("click", function () {
      changeMonth(1);
    });

    els.themeButton.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("smart-calendar-theme", next);
    });

    els.fabAdd.addEventListener("click", function () {
      openAddMenu();
    });

    els.modalClose.addEventListener("click", closeTaskModal);
    els.taskCancel.addEventListener("click", closeTaskModal);
    els.taskSave.addEventListener("click", saveTaskFromModal);
    els.taskDelete.addEventListener("click", deleteTaskFromModal);
    els.taskAllDay.addEventListener("change", syncAllDayFields);
    els.colorSwatches.addEventListener("click", function (event) {
      var swatch = event.target.closest(".color-swatch");
      if (!swatch) {
        return;
      }
      selectedColor = swatch.dataset.color;
      document.querySelectorAll(".color-swatch").forEach(function (item) {
        item.classList.toggle("active", item === swatch);
      });
    });
    els.taskModal.addEventListener("click", function (event) {
      if (event.target === els.taskModal) {
        closeTaskModal();
      }
    });

    els.conflictClose.addEventListener("click", closeConflictModal);
    els.conflictCancel.addEventListener("click", closeConflictModal);
    els.conflictKeep.addEventListener("click", keepConflictTask);
    els.conflictModal.addEventListener("click", function (event) {
      if (event.target === els.conflictModal) {
        closeConflictModal();
      }
    });

    els.calendarViewport.addEventListener("wheel", onWheel, { passive: true });
    els.calendarViewport.addEventListener("touchstart", onTouchStart, { passive: true });
    els.calendarViewport.addEventListener("touchend", onTouchEnd, { passive: true });

    bindDragEvents();

    els.addMenuClose.addEventListener("click", closeAddMenu);
    els.addMenuModal.addEventListener("click", function (event) {
      if (event.target === els.addMenuModal) {
        closeAddMenu();
      }
    });
    els.addGoalOption.addEventListener("click", openGoalModal);
    els.addTaskOption.addEventListener("click", openQuickTaskModal);
    els.goalClose.addEventListener("click", closeGoalModal);
    els.goalModal.addEventListener("click", function (event) {
      if (event.target === els.goalModal) {
        closeGoalModal();
      }
    });
    els.goalGenerateBtn.addEventListener("click", generateGoalPlan);
    els.quickClose.addEventListener("click", closeQuickModal);
    els.quickModal.addEventListener("click", function (event) {
      if (event.target === els.quickModal) {
        closeQuickModal();
      }
    });
    els.quickGenerateBtn.addEventListener("click", generateQuickTask);
    els.chatClose.addEventListener("click", closeChatPanel);
    els.chatMic.addEventListener("click", function () {
      if (listening) {
        stopListening();
      } else {
        startListening();
      }
    });
    els.chatSend.addEventListener("click", function () {
      var text = els.chatInput.value.trim();
      if (text) {
        sendChatMessage(text);
      }
    });
    els.chatInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        var text = els.chatInput.value.trim();
        if (text) {
          sendChatMessage(text);
        }
      }
    });
  }

  function renderMonth() {
    els.monthLabel.textContent = state.cursor.getFullYear() + "年" + (state.cursor.getMonth() + 1) + "月";
    var gridStart = startOfWeek(state.cursor);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < 42; i += 1) {
      fragment.appendChild(createDayCell(addDays(gridStart, i)));
    }

    els.monthGrid.innerHTML = "";
    els.monthGrid.appendChild(fragment);
  }

  function createDayCell(date) {
    var dateKey = toDateKey(date);
    var tasks = tasksOnDate(dateKey);
    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    cell.dataset.date = dateKey;
    cell.setAttribute("aria-label", formatFullDate(date));

    if (!isSameMonth(date, state.cursor)) {
      cell.classList.add("outside");
    }
    if (isToday(date)) {
      cell.classList.add("today");
    }
    if (isWeekend(date)) {
      cell.classList.add("weekend");
    }
    if (dateKey === state.selectedDate) {
      cell.classList.add("selected");
    }

    var number = document.createElement("span");
    number.className = "day-number";
    number.textContent = date.getDate();
    cell.appendChild(number);

    var list = document.createElement("span");
    list.className = "event-list";
    tasks.slice(0, 3).forEach(function (task) {
      var chip = document.createElement("span");
      chip.className = "event-chip";
      chip.textContent = task.title;
      chip.style.background = task.color || EVENT_COLORS[0];
      chip.draggable = true;
      chip.dataset.taskId = task.id;
      chip.addEventListener("click", function (event) {
        event.stopPropagation();
        openEditModal(task.id);
      });
      list.appendChild(chip);
    });

    if (tasks.length > 3) {
      var more = document.createElement("span");
      more.className = "event-more";
      more.textContent = "+" + (tasks.length - 3);
      list.appendChild(more);
    }

    cell.appendChild(list);

    cell.addEventListener("click", function () {
      state.selectedDate = dateKey;
      saveState();
      renderMonth();
      renderTaskPanel(dateKey);
    });

    return cell;
  }

  function renderTaskPanel(dateKey) {
    els.taskPanelDate.textContent = formatDayHeader(parseDateKey(dateKey));
    var tasks = tasksOnDate(dateKey).sort(byStartTime);
    els.taskPanelCount.textContent = tasks.length ? tasks.length + " 个任务" : "暂无任务";
    els.taskPanelList.innerHTML = "";

    if (!tasks.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "这一天还没有日程";
      els.taskPanelList.appendChild(empty);
      return;
    }

    tasks.forEach(function (task) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "task-item";
      item.classList.toggle("completed", !!task.completed);

      var circle = document.createElement("span");
      circle.className = "check-circle";
      circle.setAttribute("aria-hidden", "true");
      item.appendChild(circle);

      var content = document.createElement("div");
      content.className = "task-item-content";

      var title = document.createElement("div");
      title.className = "task-title";
      title.textContent = task.title;
      content.appendChild(title);

      var time = document.createElement("div");
      time.className = "task-time";
      time.textContent = formatTimeRange(task);
      content.appendChild(time);

      item.appendChild(content);

      circle.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleTaskCompleted(task.id);
      });

      item.addEventListener("click", function () {
        openEditModal(task.id);
      });

      els.taskPanelList.appendChild(item);
    });
  }

  function toggleTaskCompleted(taskId) {
    var task = findTaskById(taskId);
    if (!task) {
      return;
    }
    task.completed = !task.completed;
    saveState();
    renderMonth();
    renderTaskPanel(state.selectedDate);
    showToast(task.completed ? "已完成" : "已取消完成");
  }

  function openCreateModal(dateKey, start) {
    activeTaskId = null;
    selectedColor = EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)];
    els.modalTitle.textContent = "新建日程";
    els.taskTitle.value = "";
    els.taskDate.value = dateKey || state.selectedDate;
    els.taskAllDay.checked = false;
    els.taskStart.value = start || "09:00";
    els.taskEnd.value = "10:00";
    els.taskPriority.value = "中";
    els.taskNotes.value = "";
    els.taskCompleted.checked = false;
    els.taskDelete.hidden = true;
    renderColorSwatches();
    syncAllDayFields();
    showTaskModal();
  }

  function openEditModal(taskId) {
    var task = findTaskById(taskId);
    if (!task) {
      return;
    }

    activeTaskId = task.id;
    selectedColor = task.color || EVENT_COLORS[0];
    els.modalTitle.textContent = "编辑日程";
    els.taskTitle.value = task.title || "";
    els.taskDate.value = task.date || state.selectedDate;
    els.taskAllDay.checked = !!task.allDay;
    els.taskStart.value = task.start || "";
    els.taskEnd.value = task.end || "";
    els.taskPriority.value = task.priority || "中";
    els.taskNotes.value = task.notes || "";
    els.taskCompleted.checked = !!task.completed;
    els.taskDelete.hidden = false;
    renderColorSwatches();
    syncAllDayFields();
    showTaskModal();
  }

  function closeTaskModal() {
    els.taskModal.hidden = true;
    activeTaskId = null;
  }

  function showTaskModal() {
    els.taskModal.hidden = false;
    els.taskTitle.focus();
  }

  function renderColorSwatches() {
    els.colorSwatches.innerHTML = "";
    EVENT_COLORS.forEach(function (color) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch" + (color === selectedColor ? " active" : "");
      button.style.background = color;
      button.dataset.color = color;
      els.colorSwatches.appendChild(button);
    });
  }

  function syncAllDayFields() {
    els.timeFields.hidden = els.taskAllDay.checked;
    if (els.taskAllDay.checked) {
      els.taskStart.value = "";
      els.taskEnd.value = "";
    }
  }

  function saveTaskFromModal() {
    var title = els.taskTitle.value.trim();
    if (!title) {
      showToast("请输入标题");
      els.taskTitle.focus();
      return;
    }

    var date = els.taskDate.value;
    if (!date) {
      showToast("请选择日期");
      return;
    }

    var allDay = els.taskAllDay.checked;
    var start = allDay ? null : (els.taskStart.value || null);
    var end = allDay ? null : (els.taskEnd.value || null);
    if (!allDay && (!start || !end)) {
      showToast("请填写开始和结束时间");
      return;
    }
    if (!allDay && start && end && end <= start) {
      showToast("结束时间必须晚于开始时间");
      return;
    }

    var wasEdit = !!activeTaskId;
    var taskData = {
      id: activeTaskId || createTaskId(),
      title: title,
      date: date,
      start: start,
      end: end,
      allDay: allDay,
      color: selectedColor,
      priority: els.taskPriority.value,
      notes: els.taskNotes.value.trim(),
      completed: els.taskCompleted.checked
    };

    closeTaskModal();
    proposeTaskSave(taskData, wasEdit);
    renderMonth();
  }

  function deleteTaskFromModal() {
    if (!activeTaskId) {
      return;
    }
    var task = findTaskById(activeTaskId);
    if (!task) {
      return;
    }
    if (!window.confirm('确定删除"' + task.title + '"吗？')) {
      return;
    }

    state.tasks = state.tasks.filter(function (item) {
      return item.id !== activeTaskId;
    });
    saveState();
    closeTaskModal();
    renderMonth();
    renderTaskPanel(state.selectedDate);
    showToast("已删除");
  }

  function proposeTaskSave(taskData, wasEdit) {
    if (taskData.allDay) {
      commitTaskSave(taskData, wasEdit);
      return;
    }

    var conflicts = findOverlappingTasks(
      taskData.date,
      taskData.start,
      taskData.end,
      wasEdit ? taskData.id : null
    );

    if (!conflicts.length) {
      commitTaskSave(taskData, wasEdit);
      return;
    }

    pendingTask = { taskData: taskData, wasEdit: wasEdit };
    openConflictModal(taskData, conflicts);
  }

  function commitTaskSave(taskData, wasEdit) {
    if (wasEdit) {
      var index = state.tasks.findIndex(function (task) {
        return task.id === taskData.id;
      });
      if (index !== -1) {
        state.tasks[index] = normalizeTask(taskData);
      }
    } else {
      state.tasks.push(normalizeTask(taskData));
    }
    saveState();
    renderMonth();
    renderTaskPanel(state.selectedDate);
    showToast(wasEdit ? "已更新" : "已创建");
  }

  function openConflictModal(taskData, conflicts) {
    els.conflictList.innerHTML = "";

    var newItem = document.createElement("div");
    newItem.className = "conflict-item";
    newItem.innerHTML =
      '<div class="conflict-item-title">' + escapeHtml(taskData.title) + "</div>" +
      '<div class="conflict-item-meta">新日程 ' + taskData.start + " - " + taskData.end + "</div>";
    els.conflictList.appendChild(newItem);

    conflicts.forEach(function (task) {
      var item = document.createElement("div");
      item.className = "conflict-item";
      item.innerHTML =
        '<div class="conflict-item-title">' + escapeHtml(task.title) + "</div>" +
        '<div class="conflict-item-meta">' + task.start + " - " + task.end + "</div>";
      els.conflictList.appendChild(item);
    });

    renderConflictOptions(taskData);
    els.conflictModal.hidden = false;
  }

  function closeConflictModal() {
    els.conflictModal.hidden = true;
    pendingTask = null;
  }

  function keepConflictTask() {
    if (!pendingTask) {
      return;
    }
    var pending = pendingTask;
    closeConflictModal();
    commitTaskSave(pending.taskData, pending.wasEdit);
  }

  function renderConflictOptions(taskData) {
    var options = [
      { label: "前移", action: "earlier" },
      { label: "后移", action: "later" },
      { label: "换天", action: "nextDay" },
      { label: "拆分", action: "split" }
    ];

    els.conflictOptions.innerHTML = "";
    options.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "conflict-option";
      button.textContent = option.label;
      var suggestion = createConflictSuggestion(taskData, option.action);
      if (!suggestion) {
        button.disabled = true;
        button.textContent += "（无空档）";
      }
      button.addEventListener("click", function () {
        applyConflictSuggestion(suggestion);
      });
      els.conflictOptions.appendChild(button);
    });
  }

  function createConflictSuggestion(taskData, action) {
    var duration = taskDuration(taskData);
    var excludeId = pendingTask && pendingTask.wasEdit ? taskData.id : null;

    if (action === "earlier") {
      var earlier = findFreeSlotBefore(taskData.date, duration, excludeId, minutesFromTime(taskData.start));
      return earlier === null ? null : copyTaskWithTime(taskData, earlier, earlier + duration);
    }
    if (action === "later") {
      var later = findFreeSlotAfter(taskData.date, duration, excludeId, minutesFromTime(taskData.end));
      return later === null ? null : copyTaskWithTime(taskData, later, later + duration);
    }
    if (action === "nextDay") {
      var next = findFreeSlotNextDay(taskData.date, minutesFromTime(taskData.start), duration, excludeId);
      return next ? copyTaskWithDate(taskData, next.date, next.start, next.start + duration) : null;
    }
    if (action === "split") {
      var half = Math.ceil(duration / 2);
      var secondHalf = duration - half;
      var first = findFreeSlotBefore(taskData.date, half, excludeId, minutesFromTime(taskData.start));
      if (first === null) {
        first = findFreeSlotAfter(taskData.date, half, excludeId, minutesFromTime(taskData.end));
      }
      if (first === null) {
        return null;
      }
      var second = findFreeSlotAfter(taskData.date, secondHalf, excludeId, first + half);
      if (second === null) {
        var nextDay = findFreeSlotNextDay(taskData.date, 8 * 60, secondHalf, excludeId);
        return nextDay
          ? [copyTaskWithTime(taskData, first, first + half), copyTaskWithDate(taskData, nextDay.date, nextDay.start, nextDay.start + secondHalf)]
          : null;
      }
      return [copyTaskWithTime(taskData, first, first + half), copyTaskWithTime(taskData, second, second + secondHalf)];
    }
    return null;
  }

  function applyConflictSuggestion(suggestion) {
    if (!pendingTask || !suggestion) {
      return;
    }
    var pending = pendingTask;
    closeConflictModal();

    if (Array.isArray(suggestion)) {
      if (pending.wasEdit) {
        state.tasks = state.tasks.filter(function (task) {
          return task.id !== pending.taskData.id;
        });
      }
      suggestion.forEach(function (taskData, index) {
        var splitTask = normalizeTask(taskData);
        splitTask.id = createTaskId();
        if (index > 0) {
          splitTask.title = taskData.title + "（续）";
        }
        state.tasks.push(splitTask);
      });
      saveState();
      renderMonth();
      renderTaskPanel(state.selectedDate);
      showToast("已拆分");
      return;
    }

    commitTaskSave(suggestion, pending.wasEdit);
  }

  function copyTaskWithTime(taskData, startMinutes, endMinutes) {
    var copy = Object.assign({}, taskData);
    copy.start = minutesToTime(startMinutes);
    copy.end = minutesToTime(endMinutes);
    return copy;
  }

  function copyTaskWithDate(taskData, dateKey, startMinutes, endMinutes) {
    var copy = Object.assign({}, taskData);
    copy.date = dateKey;
    copy.start = minutesToTime(startMinutes);
    copy.end = minutesToTime(endMinutes);
    return copy;
  }

  function findOverlappingTasks(dateKey, start, end, excludeId) {
    var startMinutes = minutesFromTime(start);
    var endMinutes = minutesFromTime(end);
    if (startMinutes === null || endMinutes === null) {
      return [];
    }
    return state.tasks.filter(function (task) {
      if (task.id === excludeId || task.completed || task.allDay || !task.start || !task.end || task.date !== dateKey) {
        return false;
      }
      return minutesFromTime(task.start) < endMinutes && minutesFromTime(task.end) > startMinutes;
    });
  }

  function busyIntervals(dateKey, excludeId) {
    return state.tasks
      .filter(function (task) {
        return task.date === dateKey && !task.completed && !task.allDay && task.id !== excludeId && task.start && task.end;
      })
      .map(function (task) {
        return { start: minutesFromTime(task.start), end: minutesFromTime(task.end) };
      })
      .sort(function (a, b) {
        return a.start - b.start;
      });
  }

  function isSlotFree(dateKey, start, duration, excludeId) {
    var end = start + duration;
    return busyIntervals(dateKey, excludeId).every(function (interval) {
      return end <= interval.start || start >= interval.end;
    });
  }

  function findFreeSlotAfter(dateKey, duration, excludeId, after) {
    for (var start = Math.max(0, Math.ceil(after / 15) * 15); start <= 24 * 60 - duration; start += 15) {
      if (isSlotFree(dateKey, start, duration, excludeId)) {
        return start;
      }
    }
    return null;
  }

  function findFreeSlotBefore(dateKey, duration, excludeId, before) {
    for (var start = Math.floor((before - duration) / 15) * 15; start >= 0; start -= 15) {
      if (isSlotFree(dateKey, start, duration, excludeId)) {
        return start;
      }
    }
    return null;
  }

  function findFreeSlotNextDay(dateKey, preferredStart, duration, excludeId) {
    var startDate = parseDateKey(dateKey);
    for (var offset = 1; offset <= 14; offset += 1) {
      var nextDate = toDateKey(addDays(startDate, offset));
      if (isSlotFree(nextDate, preferredStart, duration, excludeId)) {
        return { date: nextDate, start: preferredStart };
      }
      var firstFree = findFreeSlotAfter(nextDate, duration, excludeId, 8 * 60);
      if (firstFree !== null) {
        return { date: nextDate, start: firstFree };
      }
    }
    return null;
  }

  function bindDragEvents() {
    els.monthGrid.addEventListener("dragstart", function (event) {
      var chip = event.target.closest(".event-chip");
      if (!chip || !chip.dataset.taskId) {
        return;
      }
      event.dataTransfer.setData("text/plain", chip.dataset.taskId);
      event.dataTransfer.effectAllowed = "move";
    });

    els.monthGrid.addEventListener("dragover", function (event) {
      var cell = event.target.closest(".day-cell");
      if (!cell) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".day-cell.drag-over").forEach(function (item) {
        item.classList.remove("drag-over");
      });
      cell.classList.add("drag-over");
    });

    els.monthGrid.addEventListener("drop", function (event) {
      var cell = event.target.closest(".day-cell");
      if (!cell) {
        return;
      }
      event.preventDefault();
      document.querySelectorAll(".day-cell.drag-over").forEach(function (item) {
        item.classList.remove("drag-over");
      });
      moveTaskToDate(event.dataTransfer.getData("text/plain"), cell.dataset.date);
    });
  }

  function moveTaskToDate(taskId, dateKey) {
    if (!taskId || !dateKey) {
      return;
    }
    var task = findTaskById(taskId);
    if (!task) {
      return;
    }
    task.date = dateKey;
    saveState();
    renderMonth();
    renderTaskPanel(state.selectedDate);
    showToast("已移动");
  }

  function onWheel(event) {
    if (event.deltaY === 0 || Math.abs(event.deltaY) < 25) {
      return;
    }
    var now = Date.now();
    if (now - lastMonthChange < 500) {
      return;
    }
    lastMonthChange = now;
    changeMonth(event.deltaY > 0 ? 1 : -1);
  }

  function onTouchStart(event) {
    touchStartY = event.touches[0].clientY;
  }

  function onTouchEnd(event) {
    if (touchStartY === null) {
      return;
    }
    var deltaY = event.changedTouches[0].clientY - touchStartY;
    touchStartY = null;
    if (Math.abs(deltaY) < 60) {
      return;
    }
    var now = Date.now();
    if (now - lastMonthChange < 500) {
      return;
    }
    lastMonthChange = now;
    changeMonth(deltaY < 0 ? 1 : -1);
  }

  function changeMonth(delta) {
    state.cursor = addMonths(state.cursor, delta);
    saveState();
    renderMonth();
  }

  function tasksOnDate(dateKey) {
    return state.tasks.filter(function (task) {
      return task.date === dateKey;
    });
  }

  function findTaskById(taskId) {
    return state.tasks.find(function (task) {
      return task.id === taskId;
    });
  }

  function createTaskId() {
    return "task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function createSeedTasks() {
    var today = new Date();
    var tomorrow = addDays(today, 1);
    var dayAfter = addDays(today, 2);

    return [
      {
        id: "seed-1",
        date: toDateKey(today),
        title: "产品评审",
        start: "15:00",
        end: "16:00",
        color: EVENT_COLORS[0],
        priority: "高"
      },
      {
        id: "seed-2",
        date: toDateKey(today),
        title: "健身",
        start: "19:00",
        end: "20:00",
        color: EVENT_COLORS[1],
        priority: "中"
      },
      {
        id: "seed-3",
        date: toDateKey(tomorrow),
        title: "六级复习",
        start: "20:00",
        end: "21:30",
        color: EVENT_COLORS[2],
        priority: "高"
      },
      {
        id: "seed-4",
        date: toDateKey(dayAfter),
        title: "社团例会",
        start: "18:30",
        end: "19:30",
        color: EVENT_COLORS[3],
        priority: "中"
      }
    ];
  }

  function normalizeTask(task) {
    return {
      id: task.id || createTaskId(),
      date: task.date,
      title: task.title || "",
      start: task.start || null,
      end: task.end || null,
      allDay: !!task.allDay,
      color: task.color || EVENT_COLORS[0],
      priority: task.priority || "中",
      notes: task.notes || "",
      completed: !!task.completed
    };
  }

  function loadState() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        selectedDate: toDateKey(new Date()),
        cursor: startOfMonth(new Date()),
        tasks: []
      };
    }
    try {
      var parsed = JSON.parse(saved);
      return {
        selectedDate: parsed.selectedDate || toDateKey(new Date()),
        cursor: parsed.cursor ? new Date(parsed.cursor) : startOfMonth(new Date()),
        tasks: (parsed.tasks || []).map(normalizeTask)
      };
    } catch (error) {
      return {
        selectedDate: toDateKey(new Date()),
        cursor: startOfMonth(new Date()),
        tasks: []
      };
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedDate: state.selectedDate,
        cursor: state.cursor ? state.cursor.toISOString() : null,
        tasks: state.tasks
      })
    );
  }

  function applyTheme() {
    var saved = localStorage.getItem("smart-calendar-theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  }

  var toastTimer = null;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1800);
  }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseDateKey(key) {
    var parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function startOfWeek(date) {
    var result = new Date(date);
    var day = result.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function addDays(date, amount) {
    var result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function isSameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function isToday(date) {
    return toDateKey(date) === toDateKey(new Date());
  }

  function isWeekend(date) {
    var day = date.getDay();
    return day === 0 || day === 6;
  }

  function formatFullDate(date) {
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function formatDayHeader(date) {
    var weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return (date.getMonth() + 1) + "月" + date.getDate() + "日 " + weekdays[date.getDay()];
  }

  function formatTimeRange(task) {
    if (task.allDay) {
      return "全天";
    }
    if (!task.start && !task.end) {
      return "未设置时间";
    }
    return (task.start || "") + " - " + (task.end || "");
  }

  function byStartTime(a, b) {
    return (a.start || "").localeCompare(b.start || "");
  }

  function minutesFromTime(value) {
    if (!value) {
      return null;
    }
    var parts = String(value).split(":").map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return null;
    }
    return parts[0] * 60 + parts[1];
  }

  function minutesToTime(minutes) {
    return pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
  }

  function taskDuration(taskData) {
    var start = minutesFromTime(taskData.start);
    var end = minutesFromTime(taskData.end);
    if (start === null || end === null) {
      return 60;
    }
    return Math.max(15, end - start);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function openAddMenu() {
    els.addMenuModal.hidden = false;
  }

  function closeAddMenu() {
    els.addMenuModal.hidden = true;
  }

  function openGoalModal() {
    closeAddMenu();
    els.goalModal.hidden = false;
    els.goalTitleInput.value = "";
    els.goalTimeInput.value = "";
    els.goalPreview.hidden = true;
    els.goalPreview.innerHTML = "";
    els.goalTitleInput.focus();
  }

  function closeGoalModal() {
    els.goalModal.hidden = true;
  }

  function generateGoalPlan() {
    var title = els.goalTitleInput.value.trim();
    var time = els.goalTimeInput.value.trim();
    if (!title || !time) {
      showToast("请填写目标和预花费时间");
      return;
    }

    setGenerating(els.goalGenerateBtn, true, "生成中…");
    var message = "帮我规划目标：" + title + "，预花费时间：" + time + "。请从今天开始安排每日任务，每天最多1-2个事件。";

    callCalendarAgent(message)
      .then(function (result) {
        setGenerating(els.goalGenerateBtn, false, "生成每日安排");
        if (result.intent === "create_plan" && result.plan) {
          pendingPlan = result.plan;
          renderPreviewInto(els.goalPreview, result.plan, confirmGoalPlan, cancelGoalPlan);
        } else {
          showToast(result.reply || "生成失败，请重试");
        }
      })
      .catch(function (error) {
        setGenerating(els.goalGenerateBtn, false, "生成每日安排");
        showToast(error.message || "生成失败");
      });
  }

  function openQuickTaskModal() {
    closeAddMenu();
    els.quickModal.hidden = false;
    els.quickTaskInput.value = "";
    els.quickPreview.hidden = true;
    els.quickPreview.innerHTML = "";
    els.quickTaskInput.focus();
  }

  function closeQuickModal() {
    els.quickModal.hidden = true;
  }

  function generateQuickTask() {
    var text = els.quickTaskInput.value.trim();
    if (!text) {
      showToast("请描述日程");
      return;
    }

    setGenerating(els.quickGenerateBtn, true, "解析中…");
    var message = "帮我安排一个日程：" + text + "。请给出日期、开始时间、结束时间和标题。";

    callCalendarAgent(message)
      .then(function (result) {
        setGenerating(els.quickGenerateBtn, false, "解析并安排");
        if (result.intent === "create_plan" && result.plan) {
          pendingPlan = result.plan;
          renderPreviewInto(els.quickPreview, result.plan, confirmQuickTask, cancelQuickTask);
        } else {
          showToast(result.reply || "解析失败");
        }
      })
      .catch(function (error) {
        setGenerating(els.quickGenerateBtn, false, "解析并安排");
        showToast(error.message || "解析失败");
      });
  }

  function setGenerating(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function renderPreviewInto(container, plan, confirmFn, cancelFn) {
    var events = plan.events || [];
    var html = '<div class="modal-preview-title">' + escapeHtml(plan.title || "计划") + "</div>";
    html += '<div class="modal-preview-meta">' + escapeHtml(plan.start_date || "") + " 至 " + escapeHtml(plan.end_date || "") + " · 共 " + events.length + " 个日程</div>";
    html += '<div class="modal-preview-events">';
    events.slice(0, 6).forEach(function (event) {
      html += '<div class="modal-preview-event"><span class="modal-preview-event-date">' + escapeHtml(shortDate(event.start)) + '</span><span>' + escapeHtml(event.title || "") + "</span></div>";
    });
    if (events.length > 6) {
      html += "<div>还有 " + (events.length - 6) + " 个日程…</div>";
    }
    html += "</div>";
    html += '<div class="modal-preview-actions"><button class="ghost-button" id="preview-cancel">取消</button><button class="primary-button" id="preview-confirm">加入日历</button></div>';

    container.innerHTML = html;
    container.hidden = false;
    container.querySelector("#preview-confirm").addEventListener("click", confirmFn);
    container.querySelector("#preview-cancel").addEventListener("click", cancelFn);
  }

  function confirmGoalPlan() {
    confirmPlanFromPreview(els.goalPreview, els.goalModal);
  }

  function cancelGoalPlan() {
    pendingPlan = null;
    els.goalPreview.hidden = true;
    els.goalPreview.innerHTML = "";
  }

  function confirmQuickTask() {
    confirmPlanFromPreview(els.quickPreview, els.quickModal);
  }

  function cancelQuickTask() {
    pendingPlan = null;
    els.quickPreview.hidden = true;
    els.quickPreview.innerHTML = "";
  }

  function confirmPlanFromPreview(preview, modal) {
    if (!pendingPlan) {
      return;
    }
    var plan = pendingPlan;
    pendingPlan = null;
    var result = batchAddPlanEvents(plan);
    renderMonth();
    renderTaskPanel(state.selectedDate);
    preview.hidden = true;
    preview.innerHTML = "";
    modal.hidden = true;

    if (result.added > 0) {
      var message = "已加入 " + result.added + " 个日程，从 " + shortDate(plan.start_date) + " 到 " + shortDate(plan.end_date) + "。";
      if (result.failed > 0) {
        message += "有 " + result.failed + " 个因冲突跳过。";
      }
      showToast(message);
      speak(message);
    } else {
      showToast("没有写入日程");
    }
  }

  function openChatPanel() {
    els.chatPanel.hidden = false;
    if (!els.chatMessages.childElementCount) {
      appendChatMessage("ai", "你好，我是排程助手。告诉我你想安排什么计划，我会先生成草案再询问是否加入日历。");
    }
  }

  function closeChatPanel() {
    els.chatPanel.hidden = true;
    stopListening();
  }

  function startListening() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("当前浏览器不支持语音识别");
      return;
    }
    if (listening) {
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function (event) {
      var transcript = event.results[0][0].transcript;
      els.chatInput.value = transcript;
      sendChatMessage(transcript);
    };
    recognition.onerror = function () {
      stopListening();
      showToast("没有听清，请重试");
    };
    recognition.onend = function () {
      listening = false;
      els.chatMic.classList.remove("listening");
    };

    try {
      recognition.start();
      listening = true;
      els.chatMic.classList.add("listening");
    } catch (error) {
      listening = false;
    }
  }

  function stopListening() {
    if (recognition) {
      try {
        recognition.stop();
      } catch (error) {
        // ignore
      }
    }
    listening = false;
    els.chatMic.classList.remove("listening");
  }

  function appendChatMessage(role, text) {
    var message = document.createElement("div");
    message.className = "chat-message " + role;
    message.textContent = text;
    els.chatMessages.appendChild(message);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function sendChatMessage(text) {
    if (!text) {
      return;
    }

    if (isAffirmative(text) && pendingPlan) {
      appendChatMessage("user", text);
      confirmPlan();
      return;
    }
    if (isNegative(text) && pendingPlan) {
      appendChatMessage("user", text);
      cancelPlan();
      return;
    }

    els.chatInput.value = "";
    appendChatMessage("user", text);
    var loading = document.createElement("div");
    loading.className = "chat-message ai loading";
    loading.textContent = "正在生成计划草案…";
    els.chatMessages.appendChild(loading);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

    callCalendarAgent(text)
      .then(function (result) {
        loading.remove();
        appendChatMessage("ai", result.reply || "已生成计划草案。");
        if (result.intent === "create_plan" && result.plan) {
          pendingPlan = result.plan;
          renderPlanCard(result.plan);
          if (result.need_confirmation) {
            speak(result.reply);
          }
        } else {
          pendingPlan = null;
          clearPlanCard();
        }
      })
      .catch(function (error) {
        loading.remove();
        appendChatMessage("ai", error.message || "AI 服务暂时不可用，请稍后重试。");
      });
  }

  function isAffirmative(text) {
    return /(加入|确认|可以|排进去|加到日历|好的|行|没问题)/.test(text);
  }

  function isNegative(text) {
    return /(取消|不要|调整|算了|不用|改一下)/.test(text);
  }

  function callCalendarAgent(message) {
    if (location.protocol === "file:") {
      return Promise.reject(
        new Error("请通过 python server.py 启动后端后访问 http://127.0.0.1:8000")
      );
    }

    var context = {
      today: toDateKey(new Date()),
      timezone: "Asia/Shanghai",
      existing_events: state.tasks.map(function (task) {
        return {
          title: task.title,
          date: task.date,
          start: task.start,
          end: task.end
        };
      }),
      preferences: {}
    };

    return fetch("/api/ai/calendar-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, context: context })
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("AI 服务请求失败");
      }
      return response.json();
    });
  }

  function renderPlanCard(plan) {
    var events = plan.events || [];
    var conflicts = countPlanConflicts(events);

    var html = '<div class="plan-card-title">' + escapeHtml(plan.title || "计划") + "</div>";
    html += '<div class="plan-card-meta">' + escapeHtml(plan.start_date || "") + " 至 " + escapeHtml(plan.end_date || "") + " · 共 " + events.length + " 个日程</div>";
    html += '<div class="plan-event-list">';
    events.slice(0, 8).forEach(function (event) {
      html += '<div class="plan-event"><span class="plan-event-date">' + escapeHtml(shortDate(event.start)) + '</span><span class="plan-event-title">' + escapeHtml(event.title || "") + "</span></div>";
    });
    if (events.length > 8) {
      html += '<div class="plan-event">还有 ' + (events.length - 8) + " 个日程…</div>";
    }
    html += "</div>";
    if (conflicts > 0) {
      html += '<div class="plan-conflict">有 ' + conflicts + " 个日程与现有安排冲突，加入时会跳过冲突项。</div>";
    }
    html += '<div class="plan-actions"><button class="ghost-button" id="plan-cancel">取消</button><button class="primary-button" id="plan-confirm">加入日历</button></div>';

    els.planCard.innerHTML = html;
    els.planCard.hidden = false;

    els.planCard.querySelector("#plan-confirm").addEventListener("click", confirmPlan);
    els.planCard.querySelector("#plan-cancel").addEventListener("click", cancelPlan);
  }

  function clearPlanCard() {
    els.planCard.hidden = true;
    els.planCard.innerHTML = "";
  }

  function countPlanConflicts(events) {
    return events.filter(function (event) {
      var taskData = planEventToTask(event);
      return findOverlappingTasks(taskData.date, taskData.start, taskData.end, null).length > 0;
    }).length;
  }

  function confirmPlan() {
    if (!pendingPlan) {
      return;
    }
    var plan = pendingPlan;
    pendingPlan = null;
    clearPlanCard();

    var result = batchAddPlanEvents(plan);
    renderMonth();
    renderTaskPanel(state.selectedDate);

    if (result.added > 0) {
      var message = "已加入 " + result.added + " 个日程，从 " + shortDate(plan.start_date) + " 到 " + shortDate(plan.end_date) + "。";
      if (result.failed > 0) {
        message += "有 " + result.failed + " 个日程因冲突被跳过。";
      }
      appendChatMessage("ai", message);
      showToast(message);
      speak(message);
    } else {
      appendChatMessage("ai", "没有写入日程。");
    }
  }

  function cancelPlan() {
    pendingPlan = null;
    clearPlanCard();
    appendChatMessage("ai", "已取消，不写入日历。你可以继续说调整要求。");
  }

  function batchAddPlanEvents(plan) {
    var added = 0;
    var failed = 0;

    (plan.events || []).forEach(function (event) {
      var taskData = planEventToTask(event);
      if (!taskData.title) {
        failed += 1;
        return;
      }
      var conflicts = findOverlappingTasks(taskData.date, taskData.start, taskData.end, null);
      if (conflicts.length) {
        failed += 1;
        return;
      }
      state.tasks.push(normalizeTask(taskData));
      added += 1;
    });

    if (added) {
      saveState();
    }
    return { added: added, failed: failed };
  }

  function planEventToTask(event) {
    var start = new Date(event.start);
    var end = new Date(event.end);
    if (Number.isNaN(start.getTime())) {
      return { title: "", date: "", start: null, end: null };
    }
    if (Number.isNaN(end.getTime()) || end <= start) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    return {
      id: createTaskId(),
      date: toDateKey(start),
      title: event.title || "",
      start: toTime(start),
      end: toTime(end),
      allDay: false,
      color: categoryColor(event.category),
      priority: "中",
      notes: event.description || "",
      completed: false
    };
  }

  function categoryColor(category) {
    var map = {
      "学习": EVENT_COLORS[0],
      "study": EVENT_COLORS[0],
      "运动": EVENT_COLORS[1],
      "fitness": EVENT_COLORS[1],
      "旅行": EVENT_COLORS[2],
      "travel": EVENT_COLORS[2],
      "工作": EVENT_COLORS[3],
      "work": EVENT_COLORS[3],
      "project": EVENT_COLORS[3]
    };
    return map[category] || EVENT_COLORS[4];
  }

  function toTime(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function shortDate(value) {
    if (!value) {
      return "";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }
    return (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }
})();
