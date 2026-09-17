(function () {
  "use strict";

  var STORAGE_KEY = "smart-calendar-state-v1";
  var EVENT_COLORS = ["#5b8def", "#2f9e6e", "#d68a24", "#c95d7c", "#7c6ddb"];
  var HOUR_HEIGHT = 48;

  var state = {
    view: "month",
    selectedDate: "",
    cursor: null,
    tasks: [],
    granularity: 60,
    goals: [],
    assistant: { enabled: true, frequency: "daily", muted: false },
    examMode: false,
    moodLogs: [],
    diningHalls: [],
    healthProfile: null,
    notificationsEnabled: false,
    aiSettings: { provider: "local", apiKey: "", model: "" }
  };

  var els = {};
  var activeTaskId = null;
  var selectedColor = null;
  var dragState = null;
  var suppressTaskClick = false;
  var aiDraft = null;
  var pendingTask = null;
  var autoPlan = null;
  var goalPlan = null;
  var pendingGoal = null;
  var pendingSchedule = null;
  var conflictTaskIds = {};
  var voiceActive = false;
  var voiceRecognition = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    state = loadState();
    var urlView = new URLSearchParams(window.location.search).get("view");
    if (["month", "day", "week", "agenda", "goal", "assistant"].indexOf(urlView) !== -1) {
      state.view = urlView;
    }

    if (!state.tasks.length) {
      state.tasks = createSeedTasks().map(normalizeTask);
      saveState();
    } else {
      state.tasks = state.tasks.map(normalizeTask);
    }

    var overdueMoved = autoRescheduleOverdueGoalTasks();
    state.cursor = startOfMonth(parseDateKey(state.selectedDate));
    bindEvents();
    render();
    applyTheme();
    window.setInterval(updateCurrentLine, 60000);
    registerServiceWorker();
    if (overdueMoved) {
      showToast("已自动顺延 " + overdueMoved + " 个未完成目标");
    }
  }

  function cacheElements() {
    els.layout = document.getElementById("layout");
    els.dayPanel = document.getElementById("day-panel");
    els.viewLabel = document.getElementById("view-label");
    els.prevPeriod = document.getElementById("prev-period");
    els.nextPeriod = document.getElementById("next-period");
    els.monthView = document.getElementById("month-view");
    els.dayView = document.getElementById("day-view");
    els.weekView = document.getElementById("week-view");
    els.agendaView = document.getElementById("agenda-view");
    els.monthGrid = document.getElementById("month-grid");
    els.timeline = document.getElementById("timeline");
    els.timelineHours = document.getElementById("timeline-hours");
    els.allDayList = document.getElementById("all-day-list");
    els.taskLayer = document.getElementById("task-layer");
    els.currentLine = document.getElementById("current-line");
    els.weekGridWrap = document.getElementById("week-grid-wrap");
    els.agendaList = document.getElementById("agenda-list");
    els.goalView = document.getElementById("goal-view");
    els.goalDashboard = document.getElementById("goal-dashboard");
    els.goalModal = document.getElementById("goal-modal");
    els.goalModalClose = document.getElementById("goal-modal-close");
    els.goalModalCancel = document.getElementById("goal-modal-cancel");
    els.goalTitle = document.getElementById("goal-title");
    els.goalDeadline = document.getElementById("goal-deadline");
    els.goalResult = document.getElementById("goal-result");
    els.goalDailyMinutes = document.getElementById("goal-daily-minutes");
    els.goalAvailableTime = document.getElementById("goal-available-time");
    els.goalGenerate = document.getElementById("goal-generate");
    els.goalPreviewModal = document.getElementById("goal-preview-modal");
    els.goalPreviewClose = document.getElementById("goal-preview-close");
    els.goalPreviewCancel = document.getElementById("goal-preview-cancel");
    els.goalPreviewConfirm = document.getElementById("goal-preview-confirm");
    els.goalPreviewContent = document.getElementById("goal-preview-content");
    els.assistantView = document.getElementById("assistant-view");
    els.assistantPanel = document.getElementById("assistant-panel");
    els.selectedDateLabel = document.getElementById("selected-date-label");
    els.dayTasks = document.getElementById("day-tasks");
    els.todayButton = document.getElementById("today-button");
    els.addTaskButton = document.getElementById("add-task-button");
    els.fabAdd = document.getElementById("fab-add");
    els.themeButton = document.getElementById("theme-button");
    els.toast = document.getElementById("toast");
    els.aiInput = document.getElementById("ai-input");
    els.aiButton = document.getElementById("ai-button");
    els.aiPreviewModal = document.getElementById("ai-preview-modal");
    els.aiPreviewClose = document.getElementById("ai-preview-close");
    els.aiPreviewCancel = document.getElementById("ai-preview-cancel");
    els.aiPreviewConfirm = document.getElementById("ai-preview-confirm");
    els.aiPreviewTitle = document.getElementById("ai-preview-title");
    els.aiPreviewDate = document.getElementById("ai-preview-date");
    els.aiPreviewTime = document.getElementById("ai-preview-time");
    els.aiPreviewPriority = document.getElementById("ai-preview-priority");
    els.aiPreviewReminder = document.getElementById("ai-preview-reminder");
    els.aiPreviewTags = document.getElementById("ai-preview-tags");
    els.autoButton = document.getElementById("auto-button");
    els.autoPreviewModal = document.getElementById("auto-preview-modal");
    els.autoPreviewClose = document.getElementById("auto-preview-close");
    els.autoPreviewCancel = document.getElementById("auto-preview-cancel");
    els.autoPreviewConfirm = document.getElementById("auto-preview-confirm");
    els.autoPreviewList = document.getElementById("auto-preview-list");
    els.conflictModal = document.getElementById("conflict-modal");
    els.conflictClose = document.getElementById("conflict-close");
    els.conflictCancel = document.getElementById("conflict-cancel");
    els.conflictKeep = document.getElementById("conflict-keep");
    els.conflictList = document.getElementById("conflict-list");
    els.conflictOptions = document.getElementById("conflict-options");
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
    els.taskRepeat = document.getElementById("task-repeat");
    els.taskReminder = document.getElementById("task-reminder");
    els.colorSwatches = document.getElementById("color-swatches");
    els.taskTags = document.getElementById("task-tags");
    els.taskLocation = document.getElementById("task-location");
    els.taskNotes = document.getElementById("task-notes");
    els.subtaskList = document.getElementById("subtask-list");
    els.addSubtask = document.getElementById("add-subtask");
    els.taskCompleted = document.getElementById("task-completed");
    els.taskDelete = document.getElementById("task-delete");
    els.taskCancel = document.getElementById("task-cancel");
    els.taskSave = document.getElementById("task-save");
  }

  function bindEvents() {
    document.querySelectorAll(".view-tab, .mobile-nav-item").forEach(function (button) {
      if (!button.dataset.view) {
        return;
      }
      button.addEventListener("click", function () {
        setView(button.dataset.view);
      });
    });

    els.prevPeriod.addEventListener("click", function () {
      shiftPeriod(-1);
    });

    els.nextPeriod.addEventListener("click", function () {
      shiftPeriod(1);
    });

    els.todayButton.addEventListener("click", function () {
      state.selectedDate = toDateKey(new Date());
      state.cursor = startOfMonth(new Date());
      saveState();
      render();
      showToast("已回到今天");
    });

    els.addTaskButton.addEventListener("click", function () {
      openCreateModal(state.selectedDate);
    });

    els.fabAdd.addEventListener("click", function () {
      openCreateModal(state.selectedDate);
    });

    els.themeButton.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      els.themeButton.textContent = next === "dark" ? "浅色" : "深色";
      localStorage.setItem("smart-calendar-theme", next);
    });

    els.aiButton.addEventListener("click", handleAiSubmit);
    els.aiInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        handleAiSubmit();
      }
    });
    els.aiPreviewClose.addEventListener("click", closeAiPreview);
    els.aiPreviewCancel.addEventListener("click", closeAiPreview);
    els.aiPreviewConfirm.addEventListener("click", confirmAiDraft);
    els.aiPreviewModal.addEventListener("click", function (event) {
      if (event.target === els.aiPreviewModal) {
        closeAiPreview();
      }
    });
    els.autoButton.addEventListener("click", handleAutoSchedule);
    els.autoPreviewClose.addEventListener("click", closeAutoPreview);
    els.autoPreviewCancel.addEventListener("click", closeAutoPreview);
    els.autoPreviewConfirm.addEventListener("click", confirmAutoPlan);
    els.autoPreviewModal.addEventListener("click", function (event) {
      if (event.target === els.autoPreviewModal) {
        closeAutoPreview();
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
    els.goalModalClose.addEventListener("click", closeGoalModal);
    els.goalModalCancel.addEventListener("click", closeGoalModal);
    els.goalGenerate.addEventListener("click", generateGoalPlan);
    els.goalPreviewClose.addEventListener("click", closeGoalPreview);
    els.goalPreviewCancel.addEventListener("click", closeGoalPreview);
    els.goalPreviewConfirm.addEventListener("click", confirmGoalPlan);
    els.goalPreviewModal.addEventListener("click", function (event) {
      if (event.target === els.goalPreviewModal) {
        closeGoalPreview();
      }
    });

    document.querySelectorAll("[data-granularity]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.granularity = Number(button.dataset.granularity);
        saveState();
        render();
      });
    });

    els.weekGridWrap.addEventListener("click", function (event) {
      var task = event.target.closest(".week-task");
      if (task && task.dataset.taskId) {
        openEditModal(task.dataset.taskId);
        return;
      }
      var day = event.target.closest(".week-day");
      if (!day) {
        return;
      }
      state.selectedDate = day.dataset.date;
      saveState();
      setView("day");
    });

    els.agendaList.addEventListener("click", function (event) {
      var item = event.target.closest(".agenda-item");
      if (!item || !item.dataset.taskId) {
        return;
      }
      openEditModal(item.dataset.taskId);
    });

    document.addEventListener("keydown", function (event) {
      var key = event.key.toLowerCase();
      if (key === "t") {
        state.selectedDate = toDateKey(new Date());
        state.cursor = startOfMonth(new Date());
        saveState();
        render();
        showToast("已回到今天");
      } else if (key === "m") {
        setView("month");
      } else if (key === "d") {
        setView("day");
      } else if (key === "w") {
        setView("week");
      } else if (key === "a") {
        setView("agenda");
      }
    });

    els.modalClose.addEventListener("click", closeTaskModal);
    els.taskCancel.addEventListener("click", closeTaskModal);
    els.taskSave.addEventListener("click", saveTaskFromModal);
    els.taskDelete.addEventListener("click", deleteTaskFromModal);
    els.addSubtask.addEventListener("click", addSubtaskRow);
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

    els.timeline.addEventListener("click", function (event) {
      if (event.target.closest(".timeline-task")) {
        return;
      }
      var rect = els.timeline.getBoundingClientRect();
      var y = event.clientY - rect.top;
      var minutes = Math.max(0, Math.min(23 * 60 + 45, Math.floor(y / HOUR_HEIGHT * 60 / 15) * 15));
      var start = minutesToTime(minutes);
      var end = minutesToTime(Math.min(24 * 60, minutes + 60));
      openCreateModal(state.selectedDate, start, end);
    });

    bindTaskInteractions();
  }

  function setView(view) {
    if (["month", "day", "week", "agenda", "goal", "assistant"].indexOf(view) === -1) {
      return;
    }
    state.view = view;
    saveState();
    render();
  }

  function shiftPeriod(delta) {
    if (state.view === "month") {
      state.cursor = addMonths(state.cursor, delta);
    } else if (state.view === "day") {
      state.selectedDate = toDateKey(addDays(parseDateKey(state.selectedDate), delta));
    } else {
      state.selectedDate = toDateKey(addDays(parseDateKey(state.selectedDate), delta * 7));
    }
    saveState();
    render();
  }

  function render() {
    setActiveViews();
    updateToolbar();
    conflictTaskIds = getConflictTaskIds();

    els.monthView.hidden = state.view !== "month";
    els.dayView.hidden = state.view !== "day";
    els.weekView.hidden = state.view !== "week";
    els.agendaView.hidden = state.view !== "agenda";
    els.goalView.hidden = state.view !== "goal";
    els.assistantView.hidden = state.view !== "assistant";
    els.layout.classList.toggle("single", state.view !== "month");
    els.dayPanel.hidden = state.view !== "month";
    els.prevPeriod.hidden = state.view === "goal" || state.view === "assistant";
    els.nextPeriod.hidden = state.view === "goal" || state.view === "assistant";

    if (state.view === "month") {
      renderMonth();
      renderDayPanel();
    } else if (state.view === "day") {
      renderDay();
    } else if (state.view === "week") {
      renderWeek();
    } else if (state.view === "agenda") {
      renderAgenda();
    } else if (state.view === "goal") {
      renderGoalDashboard();
    } else if (state.view === "assistant") {
      renderAssistantDashboard();
    }

    updateCurrentLine();
  }

  function setActiveViews() {
    document.querySelectorAll(".view-tab").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === state.view);
    });
    document.querySelectorAll(".mobile-nav-item[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === state.view);
    });
    document.querySelectorAll("[data-granularity]").forEach(function (button) {
      button.classList.toggle("active", Number(button.dataset.granularity) === state.granularity);
    });
  }

  function updateToolbar() {
    if (state.view === "month") {
      els.viewLabel.textContent = state.cursor.getFullYear() + "年" + (state.cursor.getMonth() + 1) + "月";
    } else if (state.view === "day") {
      els.viewLabel.textContent = formatDayHeader(parseDateKey(state.selectedDate));
    } else if (state.view === "goal") {
      els.viewLabel.textContent = "目标看板";
    } else if (state.view === "assistant") {
      els.viewLabel.textContent = "智能助理";
    } else {
      var start = startOfWeek(parseDateKey(state.selectedDate));
      var end = addDays(start, 6);
      els.viewLabel.textContent = start.getFullYear() + "年" + (start.getMonth() + 1) + "月" + start.getDate() + "日 - " + (end.getMonth() + 1) + "月" + end.getDate() + "日";
    }
  }

  function renderMonth() {
    var gridStart = startOfWeek(state.cursor);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < 42; i += 1) {
      fragment.appendChild(createDayCell(addDays(gridStart, i)));
    }

    els.monthGrid.innerHTML = "";
    els.monthGrid.appendChild(fragment);
    updateMonthSelection();
  }

  function createDayCell(date) {
    var dateKey = toDateKey(date);
    var tasks = tasksOnDate(dateKey);
    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    cell.setAttribute("aria-label", formatFullDate(date));
    cell.dataset.date = dateKey;

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
      if (conflictTaskIds[task.id]) {
        chip.classList.add("conflict");
      }
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
      state.cursor = startOfMonth(date);
      saveState();
      render();
    });

    return cell;
  }

  function updateMonthSelection() {
    var selected = els.monthGrid.querySelector(
      '.day-cell[aria-label="' + formatFullDate(parseDateKey(state.selectedDate)) + '"]'
    );
    if (selected) {
      selected.classList.add("selected");
    }
  }

  function renderDayPanel() {
    var date = parseDateKey(state.selectedDate);
    els.selectedDateLabel.textContent = formatDayHeader(date);
    var tasks = tasksOnDate(state.selectedDate).sort(byStartTime);

    els.dayTasks.innerHTML = "";

    if (!tasks.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "这一天还没有任务";
      els.dayTasks.appendChild(empty);
      return;
    }

    tasks.forEach(function (task) {
      var item = document.createElement("div");
      item.className = "task-item";
      item.style.borderLeftColor = task.color || "var(--accent)";
      item.dataset.taskId = task.id;
      item.classList.toggle("completed", !!task.completed);
      if (conflictTaskIds[task.id]) {
        item.classList.add("conflict");
      }
      item.addEventListener("click", function () {
        openEditModal(task.id);
      });

      var title = document.createElement("div");
      title.className = "task-title";
      title.textContent = task.title;
      item.appendChild(title);

      var time = document.createElement("div");
      time.className = "task-time";
      time.textContent = formatTimeRange(task);
      item.appendChild(time);

      els.dayTasks.appendChild(item);
    });
  }

  function renderDay() {
    els.timeline.classList.toggle("granularity-15", state.granularity === 15);
    var allDayTasks = tasksOnDate(state.selectedDate).filter(function (task) {
      return task.allDay;
    });
    renderAllDayTasks(allDayTasks);

    var hours = "";
    for (var hour = 0; hour < 24; hour += 1) {
      hours += '<div class="hour-row"><span class="hour-label">' + pad(hour) + ':00</span></div>';
    }
    els.timelineHours.innerHTML = hours;

    var tasks = tasksOnDate(state.selectedDate)
      .filter(function (task) {
        return task.start && task.end;
      })
      .sort(byStartTime);

    assignTaskColumns(tasks);

    els.taskLayer.innerHTML = "";
    tasks.forEach(function (task) {
      var startMinutes = minutesFromTime(task.start);
      var endMinutes = minutesFromTime(task.end);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return;
      }

      var element = document.createElement("div");
      element.className = "timeline-task";
      element.style.top = startMinutes / 60 * HOUR_HEIGHT + "px";
      element.style.height = Math.max(20, (endMinutes - startMinutes) / 60 * HOUR_HEIGHT - 3) + "px";
      element.style.left = task._column / task._columns * 100 + "%";
      element.style.width = 100 / task._columns + "%";
      element.style.background = task.color || EVENT_COLORS[0];
      element.dataset.taskId = task.id;
      element.classList.toggle("completed", !!task.completed);
      if (conflictTaskIds[task.id]) {
        element.classList.add("conflict");
      }

      var title = document.createElement("div");
      title.className = "timeline-task-title";
      title.textContent = task.title;
      element.appendChild(title);

      var time = document.createElement("div");
      time.className = "timeline-task-time";
      time.textContent = task.start + " - " + task.end;
      element.appendChild(time);

      var handle = document.createElement("div");
      handle.className = "resize-handle";
      handle.dataset.action = "resize";
      element.appendChild(handle);

      els.taskLayer.appendChild(element);
    });

    updateCurrentLine();
  }

  function renderAllDayTasks(tasks) {
    els.allDayList.innerHTML = "";
    tasks.forEach(function (task) {
      var element = document.createElement("div");
      element.className = "all-day-task" + (task.completed ? " completed" : "");
      element.style.background = task.color || EVENT_COLORS[0];
      element.textContent = "全天 · " + task.title;
      element.dataset.taskId = task.id;
      element.addEventListener("click", function () {
        openEditModal(task.id);
      });
      els.allDayList.appendChild(element);
    });
  }

  function assignTaskColumns(tasks) {
    var clusters = [];
    tasks.forEach(function (task) {
      task._startMinutes = minutesFromTime(task.start);
      task._endMinutes = minutesFromTime(task.end);
      var cluster = clusters[clusters.length - 1];
      if (cluster && task._startMinutes < cluster.end) {
        cluster.tasks.push(task);
        cluster.end = Math.max(cluster.end, task._endMinutes);
      } else {
        cluster = { tasks: [task], end: task._endMinutes };
        clusters.push(cluster);
      }
    });

    clusters.forEach(function (cluster) {
      var columns = [];
      cluster.tasks.forEach(function (task) {
        var column = 0;
        while (column < columns.length && columns[column] > task._startMinutes) {
          column += 1;
        }
        if (column >= columns.length) {
          columns.push(task._endMinutes);
        } else {
          columns[column] = task._endMinutes;
        }
        task._column = column;
      });
      cluster.tasks.forEach(function (task) {
        task._columns = columns.length;
      });
    });
  }

  function renderWeek() {
    var weekStart = startOfWeek(parseDateKey(state.selectedDate));
    var dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var html = '<div class="week-grid">';

    for (var i = 0; i < 7; i += 1) {
      var date = addDays(weekStart, i);
      var dateKey = toDateKey(date);
      var tasks = tasksOnDate(dateKey).sort(byStartTime);
      html += '<div class="week-day' + (isToday(date) ? ' today' : '') + '" data-date="' + dateKey + '">';
      html += '<div class="week-day-header"><span class="week-day-name">' + dayNames[i] + '</span><span class="week-day-number">' + date.getDate() + '</span></div>';

      tasks.slice(0, 5).forEach(function (task) {
        html += '<div class="week-task' + (task.completed ? ' completed' : '') + (conflictTaskIds[task.id] ? ' conflict' : '') + '" draggable="true" data-task-id="' + task.id + '" style="background:' + (task.color || EVENT_COLORS[0]) + '">';
        html += '<div class="week-task-title">' + escapeHtml(task.title) + '</div>';
        html += '<div class="week-task-time">' + formatTimeRange(task) + '</div>';
        html += '</div>';
      });

      if (tasks.length > 5) {
        html += '<div class="event-more">+' + (tasks.length - 5) + '</div>';
      }

      html += '</div>';
    }

    html += '</div>';
    els.weekGridWrap.innerHTML = html;
  }

  function renderAgenda() {
    var weekStart = startOfWeek(parseDateKey(state.selectedDate));
    var weekEnd = addDays(weekStart, 6);
    var tasks = state.tasks
      .filter(function (task) {
        var date = parseDateKey(task.date);
        return date >= weekStart && date <= weekEnd;
      })
      .sort(function (a, b) {
        if (a.date === b.date) {
          return byStartTime(a, b);
        }
        return a.date.localeCompare(b.date);
      });

    if (!tasks.length) {
      els.agendaList.innerHTML = '<div class="empty-state">本周还没有安排</div>';
      return;
    }

    var html = "";
    var currentDate = "";
    tasks.forEach(function (task) {
      if (task.date !== currentDate) {
        if (currentDate) {
          html += '</div>';
        }
        currentDate = task.date;
        html += '<div class="agenda-group"><div class="agenda-date">' + formatDayHeader(parseDateKey(task.date)) + '</div>';
      }

      html += '<div class="agenda-item' + (task.completed ? ' completed' : '') + (conflictTaskIds[task.id] ? ' conflict' : '') + '" data-task-id="' + task.id + '" style="border-left-color:' + (task.color || "var(--accent)") + '">';
      html += '<span class="agenda-time">' + formatTimeRange(task) + '</span>';
      html += '<span class="agenda-title">' + escapeHtml(task.title) + '</span>';
      html += '</div>';
    });
    html += '</div>';
    els.agendaList.innerHTML = html;
  }

  function updateCurrentLine() {
    if (state.view !== "day") {
      return;
    }

    var now = new Date();
    if (toDateKey(now) !== state.selectedDate) {
      els.currentLine.hidden = true;
      return;
    }

    var minutes = now.getHours() * 60 + now.getMinutes();
    els.currentLine.hidden = false;
    els.currentLine.style.top = minutes / 60 * HOUR_HEIGHT + "px";
  }

  function handleAiSubmit() {
    var text = els.aiInput.value.trim();
    if (!text) {
      showToast("请输入任务内容");
      return;
    }

    aiDraft = parseNaturalLanguage(text);
    populateAiPreview();
    els.aiPreviewModal.hidden = false;
  }

  function closeAiPreview() {
    els.aiPreviewModal.hidden = true;
    aiDraft = null;
  }

  function confirmAiDraft() {
    if (!aiDraft) {
      return;
    }

    var task = normalizeTask({
      id: createTaskId(),
      title: aiDraft.title,
      date: aiDraft.date,
      start: aiDraft.allDay ? null : aiDraft.start,
      end: aiDraft.allDay ? null : aiDraft.end,
      allDay: aiDraft.allDay,
      color: EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)],
      priority: aiDraft.priority,
      repeat: "none",
      reminder: aiDraft.reminder,
      tags: aiDraft.tags,
      location: "",
      notes: "",
      subtasks: [],
      completed: false
    });

    closeAiPreview();
    els.aiInput.value = "";
    proposeTaskSave(task, false);
    render();
  }

  function populateAiPreview() {
    els.aiPreviewTitle.textContent = aiDraft.title;
    els.aiPreviewDate.textContent = formatFullDate(parseDateKey(aiDraft.date));
    els.aiPreviewTime.textContent = aiDraft.allDay ? "全天" : aiDraft.start + " - " + aiDraft.end;
    els.aiPreviewPriority.textContent = aiDraft.priority;
    els.aiPreviewReminder.textContent = formatReminder(aiDraft.reminder);
    els.aiPreviewTags.textContent = aiDraft.tags.length ? aiDraft.tags.join("、") : "无";
  }

  function parseNaturalLanguage(text) {
    var cleanText = text.replace(/\s+/g, " ").trim();
    var now = new Date();
    var dateResult = parseDateExpression(cleanText);
    var timeResult = parseTimeExpression(cleanText);
    var durationResult = parseDurationExpression(cleanText);
    var reminderResult = parseReminderExpression(cleanText);
    var priorityResult = parsePriorityExpression(cleanText);
    var tagsResult = parseTagsExpression(cleanText);

    var phrases = [];
    if (dateResult) {
      phrases.push(dateResult.phrase);
    }
    if (timeResult) {
      phrases.push(timeResult.phrase);
    }
    if (durationResult) {
      phrases.push(durationResult.phrase);
    }
    if (reminderResult) {
      phrases.push(reminderResult.phrase);
    }
    if (priorityResult) {
      phrases.push(priorityResult.phrase);
    }
    tagsResult.phrases.forEach(function (phrase) {
      phrases.push(phrase);
    });

    var title = removePhrases(cleanText, phrases);
    if (!title) {
      title = cleanText;
    }

    var dateKey = dateResult ? dateResult.dateKey : toDateKey(now);
    var startMinutes = timeResult ? timeResult.minutes : 9 * 60;
    var duration = durationResult ? durationResult.minutes : 60;
    var endMinutes = Math.min(24 * 60, startMinutes + duration);

    return {
      title: title,
      date: dateKey,
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      allDay: false,
      priority: priorityResult ? priorityResult.value : "中",
      reminder: reminderResult ? reminderResult.value : "none",
      tags: tagsResult.tags
    };
  }

  function parseDateExpression(text) {
    var match;
    var now = new Date();

    if ((match = text.match(/(\d{1,2})月(\d{1,2})[日号]/))) {
      return {
        dateKey: toDateKey(new Date(now.getFullYear(), Number(match[1]) - 1, Number(match[2]))),
        phrase: match[0]
      };
    }
    if ((match = text.match(/(\d+)天后/))) {
      return {
        dateKey: toDateKey(addDays(now, Number(match[1]))),
        phrase: match[0]
      };
    }
    if (text.indexOf("大后天") !== -1) {
      return { dateKey: toDateKey(addDays(now, 3)), phrase: "大后天" };
    }
    if (text.indexOf("后天") !== -1 || text.indexOf("后日") !== -1) {
      return { dateKey: toDateKey(addDays(now, 2)), phrase: "后天" };
    }
    if (text.indexOf("明天") !== -1 || text.indexOf("明日") !== -1) {
      return { dateKey: toDateKey(addDays(now, 1)), phrase: "明天" };
    }
    if (text.indexOf("今天") !== -1 || text.indexOf("今日") !== -1) {
      return { dateKey: toDateKey(now), phrase: "今天" };
    }

    if ((match = text.match(/(下|这|本)?(?:周|星期|礼拜)([一二三四五六日天])/))) {
      var dayMap = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
      var targetDay = dayMap[match[2]];
      var currentDay = now.getDay();
      var offset = (targetDay - currentDay + 7) % 7;
      if (match[1] === "下") {
        offset += 7;
      } else if (match[1] === "这" || match[1] === "本") {
        offset = offset;
      } else if (offset === 0) {
        offset = 7;
      }
      return {
        dateKey: toDateKey(addDays(now, offset)),
        phrase: match[0]
      };
    }

    return null;
  }

  function parseTimeExpression(text) {
    var match;
    if ((match = text.match(/(\d{1,2}):(\d{2})/))) {
      var minutes = Number(match[1]) * 60 + Number(match[2]);
      if (minutes < 24 * 60) {
        return { minutes: minutes, phrase: match[0] };
      }
    }

    match = text.match(/(凌晨|早上|早晨|上午|中午|下午|晚上|傍晚|夜里)?\s*(\d{1,2})\s*(?:点|时)(?!小时)(?:(\d{1,2})分?)?(半)?/);
    if (!match) {
      return null;
    }

    var period = match[1] || "";
    var hour = Number(match[2]);
    var minute = match[3] ? Number(match[3]) : 0;
    if (match[4]) {
      minute = 30;
    }

    if (period === "下午" || period === "晚上" || period === "傍晚" || period === "夜里") {
      if (hour < 12) {
        hour += 12;
      }
    } else if (period === "中午" && hour < 12) {
      hour += 12;
    } else if ((period === "凌晨") && hour === 12) {
      hour = 0;
    }

    return {
      minutes: clamp(hour * 60 + minute, 0, 24 * 60 - 1),
      phrase: match[0]
    };
  }

  function parseDurationExpression(text) {
    var durationText = text.replace(/(?:提前|前)\s*\d+\s*(?:分钟|小时|天)/g, " ");
    var total = 0;
    var phrases = [];
    var match;

    if (durationText.indexOf("半小时") !== -1 || durationText.indexOf("半个小时") !== -1) {
      total += 30;
      phrases.push("半小时");
    }
    if ((match = durationText.match(/(\d+(?:\.\d+)?)\s*(?:个)?小时/))) {
      total += Math.round(parseFloat(match[1]) * 60);
      phrases.push(match[0]);
    }
    if ((match = durationText.match(/(\d+)\s*分钟/))) {
      total += Number(match[1]);
      phrases.push(match[0]);
    }

    return total ? { minutes: total, phrase: phrases.join("") } : null;
  }

  function parseReminderExpression(text) {
    var match;
    if ((match = text.match(/(?:提前|前)\s*(\d+)\s*分钟/))) {
      return { value: String(Number(match[1])), phrase: match[0] };
    }
    if ((match = text.match(/(?:提前|前)\s*(\d+(?:\.\d+)?)\s*小时/))) {
      return { value: String(Math.round(parseFloat(match[1]) * 60)), phrase: match[0] };
    }
    if ((match = text.match(/(?:提前|前)\s*(\d+)\s*天/))) {
      return { value: String(Number(match[1]) * 1440), phrase: match[0] };
    }
    return null;
  }

  function parsePriorityExpression(text) {
    if (/重要|紧急|高优先级/.test(text)) {
      return { value: "高", phrase: text.match(/重要|紧急|高优先级/)[0] };
    }
    if (/低优先级|不重要/.test(text)) {
      return { value: "低", phrase: text.match(/低优先级|不重要/)[0] };
    }
    return null;
  }

  function parseTagsExpression(text) {
    var tags = [];
    var phrases = [];
    var labelMatch = text.match(/标签[:：]\s*([^,，。]+)/);
    if (labelMatch) {
      tags.push(labelMatch[1].trim());
      phrases.push(labelMatch[0]);
    }

    var hashMatches = text.match(/[#＃]([^\s#,，。]+)/g);
    if (hashMatches) {
      hashMatches.forEach(function (hash) {
        tags.push(hash.replace(/^[#＃]/, ""));
        phrases.push(hash);
      });
    }

    return { tags: tags, phrases: phrases };
  }

  function removePhrases(text, phrases) {
    var result = text;
    phrases.forEach(function (phrase) {
      if (!phrase) {
        return;
      }
      result = result.split(phrase).join(" ");
    });

    return result
      .replace(/[，。、,.;；:：]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/提醒/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\s*(和|跟|去|做|参加|上|看)\s*/, "")
      .trim();
  }

  function formatReminder(value) {
    if (!value || value === "none") {
      return "无";
    }
    var minutes = Number(value);
    if (minutes >= 1440 && minutes % 1440 === 0) {
      return "提前 " + minutes / 1440 + " 天";
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      return "提前 " + minutes / 60 + " 小时";
    }
    return "提前 " + minutes + " 分钟";
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
    render();
    showToast(wasEdit ? "任务已更新" : "任务已创建");
  }

  function openConflictModal(taskData, conflicts) {
    els.conflictList.innerHTML = "";

    var newItem = document.createElement("div");
    newItem.className = "conflict-item";
    newItem.innerHTML =
      '<div class="conflict-item-title">' + escapeHtml(taskData.title) + '</div>' +
      '<div class="conflict-item-meta">新任务 · ' + taskData.date + ' ' + taskData.start + ' - ' + taskData.end + '</div>';
    els.conflictList.appendChild(newItem);

    conflicts.forEach(function (task) {
      var item = document.createElement("div");
      item.className = "conflict-item";
      item.innerHTML =
        '<div class="conflict-item-title">' + escapeHtml(task.title) + '</div>' +
        '<div class="conflict-item-meta">' + task.start + ' - ' + task.end + '</div>';
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
      button.dataset.action = option.action;

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
      var earlierStart = findFreeSlotBefore(taskData.date, duration, excludeId, minutesFromTime(taskData.start));
      if (earlierStart === null) {
        return null;
      }
      return copyTaskWithTime(taskData, earlierStart, earlierStart + duration);
    }

    if (action === "later") {
      var laterStart = findFreeSlotAfter(taskData.date, duration, excludeId, minutesFromTime(taskData.end));
      if (laterStart === null) {
        return null;
      }
      return copyTaskWithTime(taskData, laterStart, laterStart + duration);
    }

    if (action === "nextDay") {
      var next = findFreeSlotNextDay(taskData.date, minutesFromTime(taskData.start), duration, excludeId);
      if (!next) {
        return null;
      }
      return copyTaskWithDate(taskData, next.date, next.start, next.start + duration);
    }

    if (action === "split") {
      var half = Math.ceil(duration / 2);
      var secondHalf = duration - half;
      var firstStart = findFreeSlotAfter(taskData.date, half, excludeId, 0);
      if (firstStart === null) {
        firstStart = findFreeSlotBefore(taskData.date, half, excludeId, minutesFromTime(taskData.start));
      }
      if (firstStart === null) {
        return null;
      }

      var secondStart = findFreeSlotAfter(taskData.date, secondHalf, excludeId, firstStart + half);
      if (secondStart === null) {
        var nextDay = findFreeSlotNextDay(taskData.date, 8 * 60, secondHalf, excludeId);
        if (!nextDay) {
          return null;
        }
        return [
          copyTaskWithTime(taskData, firstStart, firstStart + half),
          copyTaskWithDate(taskData, nextDay.date, nextDay.start, nextDay.start + secondHalf)
        ];
      }

      return [
        copyTaskWithTime(taskData, firstStart, firstStart + half),
        copyTaskWithTime(taskData, secondStart, secondStart + secondHalf)
      ];
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
      render();
      showToast("已拆分为两个任务");
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
      if (task.id === excludeId || task.completed || task.allDay || !task.start || !task.end) {
        return false;
      }
      if (task.date !== dateKey) {
        return false;
      }
      var taskStart = minutesFromTime(task.start);
      var taskEnd = minutesFromTime(task.end);
      return taskStart < endMinutes && taskEnd > startMinutes;
    });
  }

  function getConflictTaskIds() {
    var ids = {};
    for (var i = 0; i < state.tasks.length; i += 1) {
      for (var j = i + 1; j < state.tasks.length; j += 1) {
        var a = state.tasks[i];
        var b = state.tasks[j];
        if (a.date !== b.date || a.completed || b.completed || a.allDay || b.allDay) {
          continue;
        }
        if (!a.start || !a.end || !b.start || !b.end) {
          continue;
        }
        if (minutesFromTime(a.start) < minutesFromTime(b.end) && minutesFromTime(b.start) < minutesFromTime(a.end)) {
          ids[a.id] = true;
          ids[b.id] = true;
        }
      }
    }
    return ids;
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

  function isSlotFree(dateKey, start, duration, excludeId, extraIntervals) {
    var end = start + duration;
    var intervals = busyIntervals(dateKey, excludeId);
    (extraIntervals || []).forEach(function (interval) {
      if (interval.date === dateKey) {
        intervals.push({ start: interval.start, end: interval.end });
      }
    });
    return intervals.every(function (interval) {
      return end <= interval.start || start >= interval.end;
    });
  }

  function findFreeSlotAfter(dateKey, duration, excludeId, after) {
    for (var start = Math.max(0, Math.ceil(after / 15) * 15); start <= 24 * 60 - duration; start += 15) {
      if (isSlotFree(dateKey, start, duration, excludeId, [])) {
        return start;
      }
    }
    return null;
  }

  function findFreeSlotBefore(dateKey, duration, excludeId, before) {
    for (var start = Math.floor((before - duration) / 15) * 15; start >= 0; start -= 15) {
      if (isSlotFree(dateKey, start, duration, excludeId, [])) {
        return start;
      }
    }
    return null;
  }

  function findFreeSlotNextDay(dateKey, preferredStart, duration, excludeId) {
    var startDate = parseDateKey(dateKey);
    for (var offset = 1; offset <= 14; offset += 1) {
      var nextDate = toDateKey(addDays(startDate, offset));
      if (isSlotFree(nextDate, preferredStart, duration, excludeId, [])) {
        return { date: nextDate, start: preferredStart };
      }
      var firstFree = findFreeSlotAfter(nextDate, duration, excludeId, 8 * 60);
      if (firstFree !== null) {
        return { date: nextDate, start: firstFree };
      }
    }
    return null;
  }

  function taskDuration(taskData) {
    var start = minutesFromTime(taskData.start);
    var end = minutesFromTime(taskData.end);
    if (start === null || end === null) {
      return 60;
    }
    return Math.max(15, end - start);
  }

  function handleAutoSchedule() {
    var text = els.aiInput.value.trim();
    if (!text) {
      showToast("请输入要自动排程的任务");
      return;
    }

    autoPlan = buildAutoPlan(text);
    renderAutoPlan();
    els.autoPreviewModal.hidden = false;
  }

  function buildAutoPlan(text) {
    var items = parseAutoItems(text);
    if (!items.length) {
      items = [{ title: text, priority: "中", duration: 60 }];
    }

    var deadline = getAutoDeadline(text);
    var startDate = new Date();
    var extraIntervals = [];

    return items.map(function (item) {
      var scheduled = null;
      for (var offset = 0; offset <= 14; offset += 1) {
        var date = toDateKey(addDays(startDate, offset));
        var start = findAutoSlot(date, item.duration, extraIntervals);
        if (start !== null) {
          scheduled = {
            date: date,
            start: start,
            end: start + item.duration
          };
          break;
        }
        if (date === toDateKey(deadline)) {
          break;
        }
      }

      if (!scheduled) {
        scheduled = {
          date: toDateKey(deadline),
          start: 9 * 60,
          end: 9 * 60 + item.duration
        };
      }

      extraIntervals.push(scheduled);
      return {
        id: createTaskId(),
        title: item.title,
        date: scheduled.date,
        start: minutesToTime(scheduled.start),
        end: minutesToTime(scheduled.end),
        allDay: false,
        color: EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)],
        priority: item.priority,
        repeat: "none",
        reminder: "none",
        tags: [],
        location: "",
        notes: "",
        subtasks: [],
        completed: false,
        duration: item.duration
      };
    });
  }

  function parseAutoItems(text) {
    var cleaned = text
      .replace(/^(请|帮我|请帮我)?\s*(安排|排程)?\s*/i, "")
      .replace(/(本周|今天|明天|后天)?要完成\s*/g, "");

    var parts = cleaned.split(/[、,，;；\n]+/).map(function (part) {
      return part.trim();
    }).filter(Boolean);

    if (parts.length === 1 && cleaned.indexOf("和") !== -1) {
      parts = cleaned.split(/和/).map(function (part) {
        return part.trim();
      }).filter(Boolean);
    }

    return parts.map(function (part) {
      var title = part.replace(/^(要完成|完成)\s*/, "").trim();
      var high = /重要|紧急|考试|论文/.test(title);
      return {
        title: title,
        priority: high ? "高" : "中",
        duration: /健身|运动/.test(title) ? 45 : 60
      };
    });
  }

  function getAutoDeadline(text) {
    if (text.indexOf("本周") !== -1) {
      return addDays(startOfWeek(new Date()), 6);
    }
    if (text.indexOf("今天") !== -1 || text.indexOf("今日") !== -1) {
      return new Date();
    }
    if (text.indexOf("明天") !== -1 || text.indexOf("明日") !== -1) {
      return addDays(new Date(), 1);
    }
    return addDays(new Date(), 7);
  }

  function findAutoSlot(dateKey, duration, extraIntervals) {
    for (var start = 8 * 60; start <= 22 * 60 - duration; start += 15) {
      if (isSlotFree(dateKey, start, duration, null, extraIntervals)) {
        return start;
      }
    }
    return null;
  }

  function renderAutoPlan() {
    els.autoPreviewList.innerHTML = "";
    autoPlan.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "auto-preview-item";
      row.innerHTML =
        '<div class="auto-preview-item-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="auto-preview-item-meta">' + formatFullDate(parseDateKey(item.date)) + ' · ' + item.start + ' - ' + item.end + ' · ' + item.priority + '优先级</div>';
      els.autoPreviewList.appendChild(row);
    });
  }

  function closeAutoPreview() {
    els.autoPreviewModal.hidden = true;
    autoPlan = null;
  }

  function confirmAutoPlan() {
    if (!autoPlan || !autoPlan.length) {
      return;
    }

    var count = autoPlan.length;
    autoPlan.forEach(function (item) {
      state.tasks.push(normalizeTask(item));
    });
    saveState();
    closeAutoPreview();
    els.aiInput.value = "";
    render();
    showToast("已自动排入 " + count + " 个任务");
  }

  function openGoalModal() {
    els.goalTitle.value = "";
    els.goalDeadline.value = toDateKey(addDays(new Date(), 90));
    els.goalResult.value = "";
    els.goalDailyMinutes.value = "90";
    els.goalAvailableTime.value = "20:00";
    els.goalModal.hidden = false;
    els.goalTitle.focus();
  }

  function closeGoalModal() {
    els.goalModal.hidden = true;
  }

  function generateGoalPlan() {
    var title = els.goalTitle.value.trim();
    var deadline = els.goalDeadline.value;
    if (!title) {
      showToast("请输入目标");
      els.goalTitle.focus();
      return;
    }
    if (!deadline) {
      showToast("请选择截止日期");
      return;
    }

    var goal = {
      id: createGoalId(),
      title: title,
      deadline: deadline,
      result: els.goalResult.value.trim(),
      dailyMinutes: Number(els.goalDailyMinutes.value) || 90,
      availableTime: els.goalAvailableTime.value || "20:00"
    };

    pendingGoal = goal;
    goalPlan = buildGoalPlan(goal);
    renderGoalPreview();
    closeGoalModal();
    els.goalPreviewModal.hidden = false;
  }

  function buildGoalPlan(goal) {
    var today = new Date();
    var deadline = parseDateKey(goal.deadline);
    var totalDays = Math.max(1, Math.ceil((deadline.getTime() - today.getTime()) / 86400000) + 1);
    var stages = buildGoalStages(totalDays);
    var availableMinutes = minutesFromTime(goal.availableTime);
    if (availableMinutes === null) {
      availableMinutes = 20 * 60;
    }

    var tasks = [];
    for (var offset = 0; offset < totalDays; offset += 1) {
      var date = addDays(today, offset);
      var dateKey = toDateKey(date);
      var stage = findStageForOffset(stages, offset);
      var duration = Math.min(Math.max(15, goal.dailyMinutes), 180);
      var start = findFreeSlotAfter(dateKey, duration, null, availableMinutes);
      if (start === null) {
        start = availableMinutes;
      }

      tasks.push({
        id: createTaskId(),
        title: goalTaskTitle(stage.name, offset),
        date: dateKey,
        start: minutesToTime(start),
        end: minutesToTime(Math.min(24 * 60, start + duration)),
        allDay: false,
        color: EVENT_COLORS[0],
        priority: "高",
        repeat: "none",
        reminder: "30",
        tags: [goal.title],
        location: "",
        notes: goal.result ? "目标结果：" + goal.result : "",
        subtasks: [],
        completed: false,
        goalId: goal.id
      });
    }

    return {
      goal: goal,
      stages: stages,
      tasks: tasks
    };
  }

  function buildGoalStages(totalDays) {
    var names;
    var weights;
    if (totalDays <= 7) {
      return [{ name: "冲刺期", start: 0, end: totalDays - 1 }];
    }
    if (totalDays < 21) {
      names = ["诊断期", "强化期", "冲刺期"];
      weights = [0.2, 0.4, 0.4];
    } else {
      names = ["诊断期", "基础期", "强化期", "冲刺期", "模考期"];
      weights = [0.1, 0.3, 0.3, 0.2, 0.1];
    }

    var counts = weights.map(function (weight) {
      return Math.floor(weight * totalDays);
    });
    var sum = counts.reduce(function (a, b) {
      return a + b;
    }, 0);
    counts[counts.length - 1] += totalDays - sum;

    var stages = [];
    var cursor = 0;
    names.forEach(function (name, index) {
      var length = counts[index];
      if (length <= 0) {
        return;
      }
      stages.push({ name: name, start: cursor, end: cursor + length - 1 });
      cursor += length;
    });
    return stages;
  }

  function findStageForOffset(stages, offset) {
    for (var i = 0; i < stages.length; i += 1) {
      if (offset >= stages[i].start && offset <= stages[i].end) {
        return stages[i];
      }
    }
    return stages[stages.length - 1];
  }

  function goalTaskTitle(stageName, offset) {
    var titles = {
      "诊断期": ["六级诊断测试", "六级错题整理", "六级弱项分析"],
      "基础期": ["背六级高频词", "六级听力精听", "六级阅读精读"],
      "强化期": ["六级专项强化", "六级翻译练习", "六级写作仿写"],
      "冲刺期": ["六级冲刺复习", "六级高频表达", "六级模考复盘"],
      "模考期": ["六级全真模考", "六级模考复盘", "六级考前速记"]
    };
    var list = titles[stageName] || ["六级学习计划"];
    return list[offset % list.length];
  }

  function renderGoalPreview() {
    var goal = goalPlan.goal;
    var totalDays = goalPlan.tasks.length;
    var html = '<div class="goal-preview-summary">';
    html += '<strong>' + escapeHtml(goal.title) + '</strong><br>';
    html += '截止日期：' + formatFullDate(parseDateKey(goal.deadline)) + '，共 ' + totalDays + ' 天<br>';
    html += '每日 ' + goal.dailyMinutes + ' 分钟，优先从 ' + goal.availableTime + ' 开始';
    html += '</div><div class="goal-preview-summary">阶段：';
    html += goalPlan.stages.map(function (stage) {
      return stage.name;
    }).join(" → ");
    html += '</div>';
    html += '<div class="goal-preview-summary">每日任务示例：';
    html += goalPlan.tasks.slice(0, 5).map(function (task) {
      return escapeHtml(task.title);
    }).join("、");
    html += '</div>';
    els.goalPreviewContent.innerHTML = html;
  }

  function closeGoalPreview() {
    els.goalPreviewModal.hidden = true;
    goalPlan = null;
    pendingGoal = null;
  }

  function confirmGoalPlan() {
    if (!goalPlan || !pendingGoal) {
      return;
    }

    pendingGoal.stages = goalPlan.stages;
    state.goals.push(pendingGoal);
    goalPlan.tasks.forEach(function (task) {
      state.tasks.push(normalizeTask(task));
    });
    saveState();
    var count = goalPlan.tasks.length;
    closeGoalPreview();
    render();
    showToast("已写入 " + count + " 个学习任务");
  }

  function renderGoalDashboard() {
    els.goalDashboard.innerHTML = "";

    if (!state.goals.length) {
      var empty = document.createElement("div");
      empty.className = "goal-dashboard-empty";
      empty.textContent = "还没有目标，先创建一个长期目标。";
      var newButton = document.createElement("button");
      newButton.type = "button";
      newButton.className = "primary-button";
      newButton.textContent = "新建目标";
      newButton.style.marginTop = "12px";
      newButton.addEventListener("click", openGoalModal);
      empty.appendChild(document.createElement("br"));
      empty.appendChild(newButton);
      els.goalDashboard.appendChild(empty);
      return;
    }

    state.goals.forEach(function (goal) {
      var goalTasks = state.tasks.filter(function (task) {
        return task.goalId === goal.id;
      });
      var done = goalTasks.filter(function (task) {
        return task.completed;
      }).length;
      var percent = goalTasks.length ? Math.round(done / goalTasks.length * 100) : 0;
      var days = Math.max(0, Math.ceil((parseDateKey(goal.deadline).getTime() - new Date().getTime()) / 86400000));

      var card = document.createElement("section");
      card.className = "goal-card";
      card.innerHTML =
        '<div class="goal-card-header">' +
          '<div class="goal-ring" style="--progress:' + percent + '"><span>' + percent + '%</span></div>' +
          '<div><div class="goal-card-title">' + escapeHtml(goal.title) + '</div>' +
          '<div class="goal-card-meta">倒计时 ' + days + ' 天 · 已生成 ' + goalTasks.length + ' 个任务 · 完成 ' + done + ' 个</div></div>' +
        '</div>' +
        '<div class="goal-stage-list">' +
          goal.stages.map(function (stage) {
            return '<div class="goal-stage"><div class="goal-stage-name">' + escapeHtml(stage.name) + '</div><div class="goal-stage-date">第 ' + (stage.start + 1) + ' - ' + (stage.end + 1) + ' 天</div></div>';
          }).join("") +
        '</div>';
      els.goalDashboard.appendChild(card);
    });
  }

  function createGoalId() {
    return "goal-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function renderAssistantDashboard() {
    els.assistantPanel.innerHTML = "";

    var voiceCard = document.createElement("section");
    voiceCard.className = "assistant-card";
    voiceCard.innerHTML =
      "<h3>AI 语音通话</h3>" +
      '<div class="assistant-action"><button class="primary-button" id="voice-call-button">开始语音通话</button> <span id="voice-status" style="color:var(--text-muted);font-size:12px"></span></div>' +
      '<div id="voice-transcript" class="assistant-list assistant-action" style="max-height:180px;overflow:auto"></div>';
    els.assistantPanel.appendChild(voiceCard);
    voiceCard.querySelector("#voice-call-button").addEventListener("click", toggleVoiceCall);

    var controls = document.createElement("div");
    controls.className = "assistant-controls";
    controls.innerHTML =
      '<label class="checkbox-field"><input id="assistant-enabled" type="checkbox"' + (state.assistant.enabled ? " checked" : "") + '><span>主动提醒</span></label>' +
      '<label class="field"><span>频率</span><select id="assistant-frequency"><option value="daily"' + (state.assistant.frequency === "daily" ? " selected" : "") + '>每天</option><option value="weekly"' + (state.assistant.frequency === "weekly" ? " selected" : "") + '>每周</option></select></label>' +
      '<label class="checkbox-field"><input id="assistant-muted" type="checkbox"' + (state.assistant.muted ? " checked" : "") + '><span>静音</span></label>';
    els.assistantPanel.appendChild(controls);

    controls.querySelector("#assistant-enabled").addEventListener("change", function (event) {
      state.assistant.enabled = event.target.checked;
      saveState();
      renderAssistantDashboard();
    });
    controls.querySelector("#assistant-frequency").addEventListener("change", function (event) {
      state.assistant.frequency = event.target.value;
      saveState();
    });
    controls.querySelector("#assistant-muted").addEventListener("change", function (event) {
      state.assistant.muted = event.target.checked;
      saveState();
    });

    var examCard = document.createElement("section");
    examCard.className = "assistant-card";
    var examButtonText = state.examMode ? "关闭考试周模式" : "开启考试周模式";
    examCard.innerHTML =
      "<h3>考试周模式</h3>" +
      "<div>" + (state.examMode ? "已开启，已自动切换冲刺节奏。" : "开启后会优先安排复习，减少非必要任务。") + "</div>" +
      (state.examMode ? "<div class=\"assistant-list\">" + getDailyThreeThings().map(function (item) { return "<div>· " + escapeHtml(item) + "</div>"; }).join("") + "</div>" : "") +
      '<button class="ghost-button assistant-action" id="exam-mode-toggle">' + examButtonText + "</button>";
    els.assistantPanel.appendChild(examCard);
    examCard.querySelector("#exam-mode-toggle").addEventListener("click", toggleExamMode);

    var todayTasks = tasksOnDate(toDateKey(new Date())).sort(byStartTime);
    var todayCard = document.createElement("section");
    todayCard.className = "assistant-card";
    todayCard.innerHTML =
      "<h3>今日行程</h3>" +
      (todayTasks.length
        ? '<div class="assistant-list">' + todayTasks.map(function (task) {
            return "<div>· " + (task.start || "全天") + " " + escapeHtml(task.title) + "</div>";
          }).join("") + "</div>"
        : "<div>今天还没有安排。</div>");
    els.assistantPanel.appendChild(todayCard);

    var proactive = buildProactiveCard();
    if (proactive) {
      els.assistantPanel.appendChild(proactive);
    }

    var moodCard = document.createElement("section");
    moodCard.className = "assistant-card";
    moodCard.innerHTML =
      "<h3>情绪与压力</h3>" +
      '<div class="mood-buttons">' + [1, 2, 3, 4, 5].map(function (score) {
        return '<button class="mood-button" data-score="' + score + '">' + score + "</button>";
      }).join("") + "</div>" +
      '<input class="assistant-action" id="mood-source" type="text" placeholder="压力来源（可选）" style="width:100%">' +
      '<button class="ghost-button assistant-action" id="mood-clear">删除情绪数据</button>';
    els.assistantPanel.appendChild(moodCard);

    var stress = getStressAssessment();
    var stressCard = document.createElement("section");
    stressCard.className = "assistant-card";
    var stressClass = stress.level === "高" || stress.level === "过载" ? "stress-high" : (stress.level === "中" ? "stress-mid" : "");
    stressCard.innerHTML =
      "<h3>当前状态</h3>" +
      '<div class="assistant-list">' +
      '<div>压力等级：<strong class="' + stressClass + '">' + stress.level + "</strong></div>" +
      "<div>任务完成率：" + stress.completion + "%</div>" +
      (stress.recentScore ? "<div>近期心情均分：" + stress.recentScore + "</div>" : "<div>近期暂无心情记录</div>") +
      "</div>" +
      '<div class="assistant-action">' + stress.suggestion + "</div>";
    els.assistantPanel.appendChild(stressCard);

    var scheduleCard = document.createElement("section");
    scheduleCard.className = "assistant-card";
    scheduleCard.innerHTML =
      "<h3>课表导入与自动分配</h3>" +
      '<textarea id="schedule-input" rows="4" style="width:100%;margin-top:8px" placeholder="每行：课程名,地点,星期(1-7),开始,结束,教师"></textarea>' +
      '<div class="assistant-action"><button class="ghost-button" id="parse-schedule">解析并预览</button> <button class="ghost-button" id="auto-allocate" disabled>自动分配空闲时间</button></div>' +
      '<div id="schedule-preview"></div>';
    els.assistantPanel.appendChild(scheduleCard);

    var healthCard = document.createElement("section");
    healthCard.className = "assistant-card";
    healthCard.innerHTML =
      "<h3>身体数据与健康建议</h3>" +
      '<div class="field-row">' +
        '<label class="field"><span>身高 cm</span><input id="health-height" type="number" value="' + (state.healthProfile ? state.healthProfile.height : "") + '"></label>' +
        '<label class="field"><span>体重 kg</span><input id="health-weight" type="number" value="' + (state.healthProfile ? state.healthProfile.weight : "") + '"></label>' +
        '<label class="field"><span>年龄</span><input id="health-age" type="number" value="' + (state.healthProfile ? state.healthProfile.age : "") + '"></label>' +
      "</div>" +
      '<div class="field-row">' +
        '<label class="field"><span>性别</span><select id="health-gender"><option value="男">男</option><option value="女">女</option></select></label>' +
        '<label class="field"><span>目标</span><select id="health-goal"><option value="保持">保持</option><option value="减脂">减脂</option><option value="增肌">增肌</option></select></label>' +
      "</div>" +
      '<button class="ghost-button assistant-action" id="generate-health">生成建议</button>' +
      '<div id="health-result" class="assistant-action"></div>' +
      '<div class="assistant-action" style="color:var(--text-muted);font-size:12px">估算仅供参考，不替代医生、营养师或教练。</div>';
    els.assistantPanel.appendChild(healthCard);

    var diningCard = document.createElement("section");
    diningCard.className = "assistant-card";
    diningCard.innerHTML =
      "<h3>校园食堂推荐</h3>" +
      '<div class="field-row"><label class="field"><span>食堂名称</span><input id="dining-name" type="text"></label><label class="field"><span>步行分钟</span><input id="dining-walk" type="number" min="1"></label></div>' +
      '<button class="ghost-button assistant-action" id="add-dining">添加食堂</button>' +
      '<div id="dining-list" class="assistant-list assistant-action"></div>' +
      '<div class="assistant-action" style="color:var(--text-muted);font-size:12px">请录入真实食堂信息，系统不编造数据。</div>';
    els.assistantPanel.appendChild(diningCard);
    renderDiningHalls();

    var arbitrationCard = buildArbitrationCard();
    if (arbitrationCard) {
      els.assistantPanel.appendChild(arbitrationCard);
    }

    var notificationCard = document.createElement("section");
    notificationCard.className = "assistant-card";
    notificationCard.innerHTML =
      "<h3>浏览器通知</h3>" +
      '<div class="assistant-action"><button class="ghost-button" id="enable-notifications">' + (state.notificationsEnabled ? "通知已开启" : "开启通知") + '</button> <button class="ghost-button" id="test-notification">测试通知</button></div>' +
      '<div class="assistant-action" style="color:var(--text-muted);font-size:12px">请通过本地 HTTP 服务器打开页面，通知与离线缓存才能生效。</div>';
    els.assistantPanel.appendChild(notificationCard);

    var aiCard = document.createElement("section");
    aiCard.className = "assistant-card";
    aiCard.innerHTML =
      "<h3>AI 服务设置</h3>" +
      '<div class="field-row">' +
        '<label class="field"><span>服务商</span><select id="ai-provider"><option value="local"' + (state.aiSettings.provider === "local" ? " selected" : "") + '>本地规则</option><option value="openai"' + (state.aiSettings.provider === "openai" ? " selected" : "") + '>OpenAI</option><option value="deepseek"' + (state.aiSettings.provider === "deepseek" ? " selected" : "") + '>DeepSeek</option></select></label>' +
        '<label class="field"><span>模型</span><input id="ai-model" type="text" value="' + escapeHtml(state.aiSettings.model || "") + '" placeholder="可选"></label>' +
      "</div>" +
      '<label class="field"><span>API Key</span><input id="ai-api-key" type="password" value="' + escapeHtml(state.aiSettings.apiKey || "") + '" placeholder="建议通过后端代理调用"></label>' +
      '<button class="ghost-button assistant-action" id="save-ai-settings">保存设置</button>' +
      '<div class="assistant-action" style="color:var(--text-muted);font-size:12px">当前自然语言解析仍以本地规则为准；浏览器直连可能受 CORS 限制。</div>';
    els.assistantPanel.appendChild(aiCard);

    var dataCard = document.createElement("section");
    dataCard.className = "assistant-card";
    dataCard.innerHTML =
      "<h3>数据与隐私</h3>" +
      '<div class="assistant-action">' +
        '<button class="ghost-button" id="export-json">导出 JSON</button> ' +
        '<button class="ghost-button" id="export-ics">导出 ICS</button> ' +
        '<button class="ghost-button" id="import-data">导入 JSON / ICS</button> ' +
        '<button class="ghost-button danger-button" id="clear-data">清空全部数据</button>' +
      "</div>" +
      '<input id="import-file" type="file" accept=".json,.ics,application/json,text/calendar" hidden>' +
      '<div class="assistant-action" style="color:var(--text-muted);font-size:12px">数据默认仅保存在当前浏览器，未上传。</div>';
    els.assistantPanel.appendChild(dataCard);

    moodCard.querySelectorAll(".mood-button").forEach(function (button) {
      button.addEventListener("click", function () {
        recordMood(Number(button.dataset.score));
      });
    });
    moodCard.querySelector("#mood-clear").addEventListener("click", clearMoodLogs);
    scheduleCard.querySelector("#parse-schedule").addEventListener("click", parseScheduleInput);
    scheduleCard.querySelector("#auto-allocate").addEventListener("click", autoAllocateSchedule);
    healthCard.querySelector("#generate-health").addEventListener("click", generateHealthAdvice);
    diningCard.querySelector("#add-dining").addEventListener("click", addDiningHall);
    dataCard.querySelector("#export-json").addEventListener("click", exportJson);
    dataCard.querySelector("#export-ics").addEventListener("click", exportIcs);
    dataCard.querySelector("#import-data").addEventListener("click", function () {
      dataCard.querySelector("#import-file").click();
    });
    dataCard.querySelector("#import-file").addEventListener("change", function (event) {
      importData(event.target.files[0]);
      event.target.value = "";
    });
    dataCard.querySelector("#clear-data").addEventListener("click", clearAllData);
    notificationCard.querySelector("#enable-notifications").addEventListener("click", enableNotifications);
    notificationCard.querySelector("#test-notification").addEventListener("click", testNotification);
    aiCard.querySelector("#save-ai-settings").addEventListener("click", saveAiSettings);
  }

  function buildProactiveCard() {
    if (!state.assistant.enabled || state.assistant.muted) {
      var disabledCard = document.createElement("section");
      disabledCard.className = "assistant-card";
      disabledCard.innerHTML = "<h3>主动建议</h3><div>主动提醒已关闭或静音。</div>";
      return disabledCard;
    }

    var items = [];
    var upcoming = state.goals
      .filter(function (goal) {
        var days = Math.ceil((parseDateKey(goal.deadline).getTime() - new Date().getTime()) / 86400000);
        return days >= 0 && days <= 7;
      })
      .map(function (goal) {
        return "考试倒计时不足 7 天，建议切换冲刺模式。";
      });
    items = items.concat(upcoming);

    var conflictCount = Object.keys(conflictTaskIds).length;
    if (conflictCount) {
      items.push("检测到 " + conflictCount + " 个任务存在时间冲突，可到日/周视图查看标红任务。");
    }

    if (hasIncompleteStreak()) {
      items.push("检测到连续 3 天有未完成复习，建议重排。");
    }

    var card = document.createElement("section");
    card.className = "assistant-card";
    card.innerHTML =
      "<h3>主动建议</h3>" +
      (items.length
        ? '<div class="assistant-list">' + items.map(function (item) { return "<div>· " + escapeHtml(item) + "</div>"; }).join("") + "</div>"
        : "<div>当前没有需要主动处理的事项。</div>") +
      (hasIncompleteStreak() ? '<button class="ghost-button assistant-action" id="reschedule-incomplete">重排未完成任务</button>' : "");
    var button = card.querySelector("#reschedule-incomplete");
    if (button) {
      button.addEventListener("click", rescheduleIncompleteTasks);
    }
    return card;
  }

  function getDailyThreeThings() {
    var priorityOrder = { "高": 0, "中": 1, "低": 2 };
    return state.tasks
      .filter(function (task) {
        return !task.completed && task.date >= toDateKey(new Date());
      })
      .sort(function (a, b) {
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1) || a.date.localeCompare(b.date);
      })
      .slice(0, 3)
      .map(function (task) {
        return task.title;
      });
  }

  function hasIncompleteStreak() {
    var goalTasks = state.tasks.filter(function (task) {
      return task.goalId && task.start && task.end;
    });
    if (!goalTasks.length) {
      return false;
    }

    var byDate = {};
    goalTasks.forEach(function (task) {
      byDate[task.date] = byDate[task.date] || [];
      byDate[task.date].push(task);
    });

    var streak = 0;
    var cursor = new Date();
    while (streak < 3) {
      var key = toDateKey(cursor);
      var dayTasks = byDate[key] || [];
      if (!dayTasks.length || dayTasks.some(function (task) { return task.completed; })) {
        break;
      }
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak >= 3;
  }

  function getStressAssessment() {
    var recent = state.moodLogs
      .filter(function (log) {
        return parseDateKey(log.date).getTime() >= addDays(new Date(), -7).getTime();
      })
      .map(function (log) {
        return log.score;
      });
    var recentScore = recent.length ? (recent.reduce(function (a, b) { return a + b; }, 0) / recent.length).toFixed(1) : null;
    var total = state.tasks.length;
    var done = state.tasks.filter(function (task) { return task.completed; }).length;
    var completion = total ? Math.round(done / total * 100) : 0;
    var examSoon = state.goals.some(function (goal) {
      return parseDateKey(goal.deadline).getTime() - new Date().getTime() <= 7 * 86400000;
    });

    var level = "低";
    if (recentScore !== null && Number(recentScore) < 3) {
      level = "高";
    } else if (recentScore !== null && Number(recentScore) < 4) {
      level = "中";
    }
    if (completion < 40 || examSoon) {
      level = "高";
    }

    var suggestion = "保持当前节奏，注意休息和运动。";
    if (level === "高") {
      suggestion = "建议减少任务、增加休息、找人聊聊，或做深呼吸；校园心理资源可咨询学校心理健康中心。";
    } else if (level === "中") {
      suggestion = "可以适当减少非必要任务，保留睡眠和运动时间。";
    }

    return { level: level, completion: completion, recentScore: recentScore, suggestion: suggestion };
  }

  function recordMood(score) {
    var sourceInput = document.getElementById("mood-source");
    state.moodLogs.push({
      date: toDateKey(new Date()),
      score: score,
      source: sourceInput ? sourceInput.value.trim() : ""
    });
    saveState();
    renderAssistantDashboard();
    showToast("心情已记录");
  }

  function clearMoodLogs() {
    if (!window.confirm("确定删除所有情绪数据吗？")) {
      return;
    }
    state.moodLogs = [];
    saveState();
    renderAssistantDashboard();
    showToast("情绪数据已删除");
  }

  function toggleExamMode() {
    state.examMode = !state.examMode;
    saveState();
    renderAssistantDashboard();
    showToast(state.examMode ? "考试周模式已开启" : "考试周模式已关闭");
  }

  function rescheduleIncompleteTasks() {
    var incomplete = state.tasks.filter(function (task) {
      return !task.completed && !task.allDay && task.start && task.end;
    });
    if (!incomplete.length) {
      showToast("没有需要重排的未完成任务");
      return;
    }

    var cursor = addDays(new Date(), 1);
    incomplete.forEach(function (task) {
      var duration = taskDuration(task);
      var start = null;
      for (var offset = 0; offset < 14; offset += 1) {
        var dateKey = toDateKey(addDays(cursor, offset));
        start = findFreeSlotAfter(dateKey, duration, task.id, 8 * 60);
        if (start !== null) {
          task.date = dateKey;
          task.start = minutesToTime(start);
          task.end = minutesToTime(start + duration);
          cursor = addDays(cursor, offset + 1);
          break;
        }
      }
    });

    saveState();
    render();
    showToast("已重排未完成任务");
  }

  function autoRescheduleOverdueGoalTasks() {
    var today = toDateKey(new Date());
    var overdue = state.tasks.filter(function (task) {
      return task.goalId && !task.completed && task.start && task.end && task.date < today;
    });
    if (!overdue.length) {
      return 0;
    }

    var moved = 0;
    var cursor = new Date();
    overdue.forEach(function (task) {
      var duration = taskDuration(task);
      for (var offset = 0; offset < 14; offset += 1) {
        var dateKey = toDateKey(addDays(cursor, offset));
        var start = findFreeSlotAfter(dateKey, duration, task.id, 8 * 60);
        if (start !== null) {
          task.date = dateKey;
          task.start = minutesToTime(start);
          task.end = minutesToTime(start + duration);
          cursor = addDays(cursor, offset + 1);
          moved += 1;
          break;
        }
      }
    });

    if (moved) {
      saveState();
    }
    return moved;
  }

  function toggleVoiceCall() {
    if (voiceActive) {
      endVoiceCall();
    } else {
      startVoiceCall();
    }
  }

  function startVoiceCall() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      showToast("当前浏览器不支持语音识别");
      return;
    }

    if (!voiceRecognition) {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      voiceRecognition = new SpeechRecognition();
      voiceRecognition.lang = "zh-CN";
      voiceRecognition.continuous = true;
      voiceRecognition.interimResults = false;
      voiceRecognition.onresult = function (event) {
        var result = event.results[event.results.length - 1][0];
        handleVoiceInput(result.transcript);
      };
      voiceRecognition.onerror = function () {
        appendVoiceTranscript("系统", "语音识别出错，请重试。");
      };
      voiceRecognition.onend = function () {
        if (voiceActive) {
          voiceRecognition.start();
        }
      };
    }

    voiceActive = true;
    var button = document.getElementById("voice-call-button");
    if (button) {
      button.textContent = "挂断通话";
    }
    var status = document.getElementById("voice-status");
    if (status) {
      status.textContent = "正在聆听";
    }
    appendVoiceTranscript("AI", "你好，我是智能日历助理，可以帮你查日程、创建任务、重排目标或记录心情。");
    speakVoice("你好，我是智能日历助理。");
    voiceRecognition.start();
  }

  function endVoiceCall() {
    voiceActive = false;
    if (voiceRecognition) {
      voiceRecognition.stop();
    }
    var button = document.getElementById("voice-call-button");
    if (button) {
      button.textContent = "开始语音通话";
    }
    var status = document.getElementById("voice-status");
    if (status) {
      status.textContent = "通话结束";
    }
    appendVoiceTranscript("系统", "通话结束");
  }

  function handleVoiceInput(text) {
    appendVoiceTranscript("你", text);
    var reply = respondToVoice(text);
    appendVoiceTranscript("AI", reply);
    speakVoice(reply);
    if (/挂断|结束通话|再见|拜拜/.test(text)) {
      endVoiceCall();
    }
  }

  function respondToVoice(text) {
    var lower = text.trim();
    if (/今天|今日/.test(lower) && /安排|行程|任务|做什么/.test(lower)) {
      var tasks = tasksOnDate(toDateKey(new Date())).sort(byStartTime);
      if (!tasks.length) {
        return "今天还没有安排。";
      }
      return "今天的安排有：" + tasks.map(function (task) {
        return (task.start || "全天") + " " + task.title;
      }).join("，");
    }
    if (/明天|明日/.test(lower)) {
      var tomorrowTasks = tasksOnDate(toDateKey(addDays(new Date(), 1))).sort(byStartTime);
      if (!tomorrowTasks.length) {
        return "明天还没有安排。";
      }
      return "明天有：" + tomorrowTasks.map(function (task) {
        return (task.start || "全天") + " " + task.title;
      }).join("，");
    }
    if (/新建|添加|创建|安排/.test(lower)) {
      var cleaned = lower.replace(/^(请|帮我)?(新建|添加|创建)(一个)?(任务|日程)?/, "").trim();
      if (!cleaned) {
        return "请告诉我任务内容，例如：明天下午 3 点开会。";
      }
      var draft = parseNaturalLanguage(cleaned);
      var task = normalizeTask({
        id: createTaskId(),
        title: draft.title,
        date: draft.date,
        start: draft.start,
        end: draft.end,
        allDay: false,
        color: EVENT_COLORS[0],
        priority: draft.priority,
        repeat: "none",
        reminder: draft.reminder,
        tags: draft.tags,
        location: "",
        notes: "",
        subtasks: [],
        completed: false,
        goalId: null
      });
      proposeTaskSave(task, false);
      return "已创建任务：" + task.title + "，" + task.start + " 到 " + task.end;
    }
    if (/未完成|重排|顺延/.test(lower)) {
      rescheduleIncompleteTasks();
      return "已把未完成任务顺延到最近空档。";
    }
    if (/目标|计划/.test(lower)) {
      if (!state.goals.length) {
        return "目前还没有目标。";
      }
      return "你的目标有：" + state.goals.map(function (goal) {
        return goal.title;
      }).join("，");
    }
    if (/心情|压力|情绪/.test(lower)) {
      var stress = getStressAssessment();
      return "当前压力等级为" + stress.level + "。" + stress.suggestion;
    }
    if (/你好|您好|嗨/.test(lower)) {
      return "你好，有什么可以帮你？";
    }
    return "我可以帮你查今天或明天的日程、创建任务、重排未完成目标，也可以记录心情。";
  }

  function speakVoice(text) {
    if (!("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function appendVoiceTranscript(role, text) {
    var transcript = document.getElementById("voice-transcript");
    if (!transcript) {
      return;
    }
    var line = document.createElement("div");
    line.textContent = role + "：" + text;
    transcript.appendChild(line);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function parseScheduleInput() {
    var text = document.getElementById("schedule-input").value.trim();
    if (!text) {
      showToast("请先粘贴课表内容");
      return;
    }

    var rows = [];
    text.split(/\n+/).forEach(function (line) {
      var parts = line.split(/[,\t，]/).map(function (part) {
        return part.trim();
      }).filter(Boolean);
      if (parts.length >= 5) {
        rows.push({
          title: parts[0],
          location: parts[1] || "",
          weekday: Number(parts[2]),
          start: normalizeTimeValue(parts[3]),
          end: normalizeTimeValue(parts[4]),
          teacher: parts[5] || ""
        });
      }
    });

    if (!rows.length) {
      showToast("未解析到有效课表，请检查格式");
      return;
    }

    pendingSchedule = rows;
    renderSchedulePreview();
  }

  function renderSchedulePreview() {
    var preview = document.getElementById("schedule-preview");
    if (!preview || !pendingSchedule) {
      return;
    }

    var weekdays = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    preview.innerHTML =
      '<div class="assistant-list">' +
      pendingSchedule.map(function (row) {
        return '<div>· ' + escapeHtml(row.title) + ' ' + (weekdays[row.weekday] || "") + ' ' + row.start + "-" + row.end + (row.location ? " @ " + escapeHtml(row.location) : "") + "</div>";
      }).join("") +
      "</div>" +
      '<button class="primary-button assistant-action" id="confirm-schedule">确认导入</button>';

    preview.querySelector("#confirm-schedule").addEventListener("click", confirmScheduleImport);
    document.getElementById("auto-allocate").disabled = false;
  }

  function confirmScheduleImport() {
    if (!pendingSchedule || !pendingSchedule.length) {
      return;
    }

    var weekStart = startOfWeek(addDays(new Date(), 7));
    var count = 0;
    pendingSchedule.forEach(function (row, index) {
      var weekday = Math.max(1, Math.min(7, row.weekday || 1));
      var date = toDateKey(addDays(weekStart, weekday - 1));
      state.tasks.push(normalizeTask({
        id: createTaskId(),
        title: row.title,
        date: date,
        start: row.start,
        end: row.end,
        allDay: false,
        color: EVENT_COLORS[index % EVENT_COLORS.length],
        priority: "高",
        repeat: "none",
        reminder: "30",
        tags: ["课表"],
        location: row.location,
        notes: row.teacher ? "教师：" + row.teacher : "",
        subtasks: [],
        completed: false,
        goalId: null
      }));
      count += 1;
    });

    saveState();
    pendingSchedule = null;
    document.getElementById("schedule-input").value = "";
    renderAssistantDashboard();
    showToast("已导入 " + count + " 节课");
  }

  function autoAllocateSchedule() {
    var weekStart = startOfWeek(addDays(new Date(), 7));
    var created = 0;
    for (var day = 0; day < 5; day += 1) {
      var dateKey = toDateKey(addDays(weekStart, day));
      var studyStart = findFreeSlotAfter(dateKey, 60, null, 9 * 60);
      if (studyStart !== null) {
        state.tasks.push(normalizeTask({
          id: createTaskId(),
          title: "自习 / 作业",
          date: dateKey,
          start: minutesToTime(studyStart),
          end: minutesToTime(studyStart + 60),
          allDay: false,
          color: EVENT_COLORS[1],
          priority: "中",
          repeat: "none",
          reminder: "none",
          tags: ["自动分配"],
          location: "",
          notes: "",
          subtasks: [],
          completed: false,
          goalId: null
        }));
        created += 1;
      }
      var exerciseStart = findFreeSlotAfter(dateKey, 45, null, 14 * 60);
      if (exerciseStart !== null) {
        state.tasks.push(normalizeTask({
          id: createTaskId(),
          title: "午间运动",
          date: dateKey,
          start: minutesToTime(exerciseStart),
          end: minutesToTime(exerciseStart + 45),
          allDay: false,
          color: EVENT_COLORS[2],
          priority: "中",
          repeat: "none",
          reminder: "none",
          tags: ["自动分配"],
          location: "",
          notes: "",
          subtasks: [],
          completed: false,
          goalId: null
        }));
        created += 1;
      }
    }

    saveState();
    renderAssistantDashboard();
    showToast("已自动分配 " + created + " 个空闲任务");
  }

  function addDiningHall() {
    var name = document.getElementById("dining-name").value.trim();
    var walk = Number(document.getElementById("dining-walk").value);
    if (!name || !walk || walk <= 0) {
      showToast("请填写食堂名称和步行分钟");
      return;
    }
    state.diningHalls.push({ name: name, walk: walk });
    saveState();
    document.getElementById("dining-name").value = "";
    document.getElementById("dining-walk").value = "";
    renderDiningHalls();
    showToast("食堂已添加");
  }

  function renderDiningHalls() {
    var list = document.getElementById("dining-list");
    if (!list) {
      return;
    }
    if (!state.diningHalls.length) {
      list.innerHTML = "<div>暂无食堂数据，请先录入。</div>";
      return;
    }

    var sorted = state.diningHalls.slice().sort(function (a, b) {
      return a.walk - b.walk;
    });
    list.innerHTML =
      "<div>最近推荐：</div>" +
      sorted.map(function (hall, index) {
        return '<div>· ' + (index === 0 ? "推荐 " : "") + escapeHtml(hall.name) + "，步行约 " + hall.walk + " 分钟</div>";
      }).join("");
  }

  function generateHealthAdvice() {
    var height = Number(document.getElementById("health-height").value);
    var weight = Number(document.getElementById("health-weight").value);
    var age = Number(document.getElementById("health-age").value);
    var gender = document.getElementById("health-gender").value;
    var goal = document.getElementById("health-goal").value;
    if (!height || !weight || !age) {
      showToast("请填写身高、体重和年龄");
      return;
    }

    state.healthProfile = { height: height, weight: weight, age: age, gender: gender, goal: goal };
    saveState();

    var bmi = weight / Math.pow(height / 100, 2);
    var exercise = "每周 3-5 次，每次 30-45 分钟，结合热身和拉伸。";
    var diet = "主食 + 优质蛋白 + 蔬菜，控制油盐糖，保证饮水。";
    if (goal === "减脂") {
      exercise = "建议有氧 30-40 分钟配合力量训练，避免久坐。";
      diet = "少油少糖，增加蔬菜和优质蛋白，晚餐清淡。";
    } else if (goal === "增肌") {
      exercise = "建议每周 3-4 次抗阻训练，训练后补充蛋白质。";
      diet = "保证蛋白质和主食，训练后加餐。";
    }

    document.getElementById("health-result").innerHTML =
      "<div>估算 BMI：" + bmi.toFixed(1) + "（仅供参考）</div>" +
      "<div>运动建议：" + exercise + "</div>" +
      "<div>饮食建议：" + diet + "</div>";
  }

  function buildArbitrationCard() {
    var conflictIds = Object.keys(conflictTaskIds);
    if (!conflictIds.length && state.goals.length < 2) {
      return null;
    }

    var card = document.createElement("section");
    card.className = "assistant-card";
    var html = "<h3>总协调建议</h3><div class=\"assistant-list\">";
    if (conflictIds.length) {
      html += "<div>检测到 " + conflictIds.length + " 个任务存在时间冲突。</div>";
    }
    if (state.goals.length >= 2) {
      html += "<div>多个目标建议优先级：课程 &gt; 考试 &gt; 健康 &gt; 长期目标 &gt; 娱乐。</div>";
    }
    html += "</div>";
    if (conflictIds.length) {
      html += '<button class="ghost-button assistant-action" id="open-day-conflicts">打开日视图处理</button>';
    }
    card.innerHTML = html;
    var button = card.querySelector("#open-day-conflicts");
    if (button) {
      button.addEventListener("click", function () {
        setView("day");
      });
    }
    return card;
  }

  function normalizeTimeValue(value) {
    var minutes = minutesFromTime(value);
    return minutes === null ? value : minutesToTime(minutes);
  }

  function exportJson() {
    var payload = {
      tasks: state.tasks,
      goals: state.goals,
      diningHalls: state.diningHalls,
      healthProfile: state.healthProfile,
      moodLogs: state.moodLogs,
      assistant: state.assistant,
      examMode: state.examMode
    };
    downloadText("smart-calendar.json", JSON.stringify(payload, null, 2), "application/json");
    showToast("JSON 已导出");
  }

  function exportIcs() {
    downloadText("smart-calendar.ics", generateIcsContent(), "text/calendar");
    showToast("ICS 已导出");
  }

  function importData(file) {
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      if (file.name.toLowerCase().indexOf(".ics") !== -1) {
        applyImportedState({ tasks: parseIcsContent(text) });
      } else {
        try {
          applyImportedState(JSON.parse(text));
        } catch (error) {
          showToast("导入失败：JSON 格式不正确");
        }
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function applyImportedState(data) {
    if (!data || typeof data !== "object") {
      showToast("导入失败：文件内容无效");
      return;
    }
    if (Array.isArray(data.tasks)) {
      state.tasks = data.tasks.map(normalizeTask);
    }
    if (Array.isArray(data.goals)) {
      state.goals = data.goals;
    }
    if (Array.isArray(data.diningHalls)) {
      state.diningHalls = data.diningHalls;
    }
    if (data.healthProfile !== undefined) {
      state.healthProfile = data.healthProfile;
    }
    if (Array.isArray(data.moodLogs)) {
      state.moodLogs = data.moodLogs;
    }
    if (data.assistant) {
      state.assistant = data.assistant;
    }
    if (data.examMode !== undefined) {
      state.examMode = !!data.examMode;
    }
    saveState();
    render();
    showToast("导入完成");
  }

  function generateIcsContent() {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SmartCalendar//CN"];
    state.tasks.forEach(function (task) {
      var date = parseDateKey(task.date);
      var start;
      var end;
      if (task.allDay) {
        start = "DTSTART;VALUE=DATE:" + toIcsDate(date);
        end = "DTEND;VALUE=DATE:" + toIcsDate(addDays(date, 1));
      } else {
        start = "DTSTART:" + toIcsDateTime(date, task.start);
        end = "DTEND:" + toIcsDateTime(date, task.end);
      }

      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + task.id + "@smart-calendar");
      lines.push(start);
      lines.push(end);
      lines.push("SUMMARY:" + escapeIcsText(task.title));
      if (task.location) {
        lines.push("LOCATION:" + escapeIcsText(task.location));
      }
      if (task.notes) {
        lines.push("DESCRIPTION:" + escapeIcsText(task.notes));
      }
      var priority = task.priority === "高" ? "1" : (task.priority === "低" ? "5" : "3");
      lines.push("PRIORITY:" + priority);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function parseIcsContent(text) {
    var blocks = text.split(/BEGIN:VEVENT/i).slice(1);
    var tasks = [];
    blocks.forEach(function (block) {
      var endIndex = block.search(/END:VEVENT/i);
      var chunk = endIndex === -1 ? block : block.slice(0, endIndex);
      var fields = parseIcsFields(chunk);
      if (!fields.SUMMARY || !fields.DTSTART) {
        return;
      }
      var start = parseIcsDateValue(fields.DTSTART);
      var end = parseIcsDateValue(fields.DTEND);
      tasks.push(normalizeTask({
        id: createTaskId(),
        title: fields.SUMMARY,
        date: start.date,
        start: start.time,
        end: end ? end.time : null,
        allDay: !start.time,
        color: EVENT_COLORS[0],
        priority: fields.PRIORITY === "1" ? "高" : (fields.PRIORITY === "5" ? "低" : "中"),
        repeat: fields.RRULE ? "weekly" : "none",
        reminder: "none",
        tags: [],
        location: fields.LOCATION || "",
        notes: fields.DESCRIPTION || "",
        subtasks: [],
        completed: false,
        goalId: null
      }));
    });
    return tasks;
  }

  function parseIcsFields(chunk) {
    var unfolded = chunk.replace(/\r?\n[ \t]/g, "");
    var fields = {};
    var regex = /([A-Z0-9-]+)((?:;[^:]*)?):(.*)/g;
    var match;
    while ((match = regex.exec(unfolded)) !== null) {
      var key = match[1].toUpperCase();
      if (fields[key] === undefined) {
        fields[key] = match[3].replace(/\r/g, "").trim();
      }
    }
    return fields;
  }

  function parseIcsDateValue(value) {
    var clean = String(value || "").replace(/^;VALUE=DATE:/i, "").trim();
    var datePart = clean.slice(0, 8);
    var timePart = clean.slice(9, 15);
    var date = datePart.slice(0, 4) + "-" + datePart.slice(4, 6) + "-" + datePart.slice(6, 8);
    var time = timePart ? timePart.slice(0, 2) + ":" + timePart.slice(2, 4) : null;
    return { date: date, time: time };
  }

  function toIcsDate(date) {
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
  }

  function toIcsDateTime(date, time) {
    var parts = String(time || "00:00").split(":");
    return toIcsDate(date) + "T" + pad(Number(parts[0])) + pad(Number(parts[1])) + "00";
  }

  function escapeIcsText(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function clearAllData() {
    if (!window.confirm("确定清空全部本地数据吗？此操作不可撤销。")) {
      return;
    }
    state = {
      view: "month",
      selectedDate: toDateKey(new Date()),
      cursor: startOfMonth(new Date()),
      tasks: [],
      granularity: 60,
      goals: [],
      assistant: { enabled: true, frequency: "daily", muted: false },
      examMode: false,
      moodLogs: [],
      diningHalls: [],
      healthProfile: null
    };
    saveState();
    render();
    showToast("数据已清空");
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        // 离线缓存注册失败不影响正常使用。
      });
    }
  }

  function enableNotifications() {
    if (!("Notification" in window)) {
      showToast("当前浏览器不支持通知");
      return;
    }
    Notification.requestPermission().then(function (permission) {
      state.notificationsEnabled = permission === "granted";
      saveState();
      renderAssistantDashboard();
      showToast(permission === "granted" ? "通知已开启" : "未授予通知权限");
    });
  }

  function testNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      showToast("请先开启并允许通知");
      return;
    }
    new Notification("智能日历", {
      body: "通知功能正常",
      icon: "./icon.svg"
    });
  }

  function saveAiSettings() {
    state.aiSettings = {
      provider: document.getElementById("ai-provider").value,
      model: document.getElementById("ai-model").value.trim(),
      apiKey: document.getElementById("ai-api-key").value.trim()
    };
    saveState();
    showToast("AI 设置已保存");
  }

  function openCreateModal(dateKey, start, end) {
    activeTaskId = null;
    selectedColor = EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)];
    els.modalTitle.textContent = "新建任务";
    els.taskTitle.value = "";
    els.taskDate.value = dateKey || state.selectedDate;
    els.taskAllDay.checked = false;
    els.taskStart.value = start || "09:00";
    els.taskEnd.value = end || "10:00";
    els.taskPriority.value = "中";
    els.taskRepeat.value = "none";
    els.taskReminder.value = "none";
    els.taskTags.value = "";
    els.taskLocation.value = "";
    els.taskNotes.value = "";
    els.subtaskList.innerHTML = "";
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
    els.modalTitle.textContent = "编辑任务";
    els.taskTitle.value = task.title || "";
    els.taskDate.value = task.date || state.selectedDate;
    els.taskAllDay.checked = !!task.allDay;
    els.taskStart.value = task.start || "";
    els.taskEnd.value = task.end || "";
    els.taskPriority.value = task.priority || "中";
    els.taskRepeat.value = task.repeat || "none";
    els.taskReminder.value = task.reminder || "none";
    els.taskTags.value = (task.tags || []).join(", ");
    els.taskLocation.value = task.location || "";
    els.taskNotes.value = task.notes || "";
    els.taskCompleted.checked = !!task.completed;
    els.taskDelete.hidden = false;

    els.subtaskList.innerHTML = "";
    (task.subtasks || []).forEach(function (subtask) {
      addSubtaskRow(subtask.text, !!subtask.done);
    });

    renderColorSwatches();
    syncAllDayFields();
    showTaskModal();
  }

  function closeTaskModal() {
    els.taskModal.hidden = true;
    activeTaskId = null;
    dragState = null;
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

    var subtasks = [];
    els.subtaskList.querySelectorAll(".subtask-row").forEach(function (row) {
      var text = row.querySelector('input[type="text"]').value.trim();
      if (text) {
        subtasks.push({
          id: "sub-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          text: text,
          done: row.querySelector('input[type="checkbox"]').checked
        });
      }
    });

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
      repeat: els.taskRepeat.value,
      reminder: els.taskReminder.value,
      tags: els.taskTags.value.split(/[,，\s]+/).filter(Boolean),
      location: els.taskLocation.value.trim(),
      notes: els.taskNotes.value.trim(),
      subtasks: subtasks,
      completed: els.taskCompleted.checked
    };

    closeTaskModal();
    proposeTaskSave(taskData, wasEdit);
    render();
  }

  function deleteTaskFromModal() {
    if (!activeTaskId) {
      return;
    }
    var task = findTaskById(activeTaskId);
    if (!task) {
      return;
    }
    if (!window.confirm('确定删除“' + task.title + '”吗？')) {
      return;
    }

    state.tasks = state.tasks.filter(function (item) {
      return item.id !== activeTaskId;
    });
    saveState();
    closeTaskModal();
    render();
    showToast("任务已删除");
  }

  function addSubtaskRow(text, done) {
    var row = document.createElement("div");
    row.className = "subtask-row";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!done;
    row.appendChild(checkbox);

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "子任务";
    input.value = text || "";
    row.appendChild(input);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.textContent = "×";
    remove.addEventListener("click", function () {
      row.remove();
    });
    row.appendChild(remove);

    els.subtaskList.appendChild(row);
  }

  function syncAllDayFields() {
    els.timeFields.hidden = els.taskAllDay.checked;
    if (els.taskAllDay.checked) {
      els.taskStart.value = "";
      els.taskEnd.value = "";
    }
  }

  function bindTaskInteractions() {
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

    els.weekGridWrap.addEventListener("dragstart", function (event) {
      var task = event.target.closest(".week-task");
      if (!task || !task.dataset.taskId) {
        return;
      }
      event.dataTransfer.setData("text/plain", task.dataset.taskId);
      event.dataTransfer.effectAllowed = "move";
    });

    els.weekGridWrap.addEventListener("dragover", function (event) {
      var day = event.target.closest(".week-day");
      if (!day) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".week-day.drag-over").forEach(function (item) {
        item.classList.remove("drag-over");
      });
      day.classList.add("drag-over");
    });

    els.weekGridWrap.addEventListener("drop", function (event) {
      var day = event.target.closest(".week-day");
      if (!day) {
        return;
      }
      event.preventDefault();
      document.querySelectorAll(".week-day.drag-over").forEach(function (item) {
        item.classList.remove("drag-over");
      });
      moveTaskToDate(event.dataTransfer.getData("text/plain"), day.dataset.date);
    });

    els.taskLayer.addEventListener("pointerdown", onTaskPointerDown);
    els.taskLayer.addEventListener("click", onTaskClick);
    document.addEventListener("pointermove", onTaskPointerMove);
    document.addEventListener("pointerup", onTaskPointerUp);
  }

  function onTaskPointerDown(event) {
    var taskElement = event.target.closest(".timeline-task");
    if (!taskElement || !taskElement.dataset.taskId) {
      return;
    }

    var task = findTaskById(taskElement.dataset.taskId);
    if (!task || task.allDay || !task.start || !task.end) {
      return;
    }

    var startMinutes = minutesFromTime(task.start);
    var endMinutes = minutesFromTime(task.end);
    if (startMinutes === null || endMinutes === null) {
      return;
    }

    var isResize = !!event.target.closest(".resize-handle");
    dragState = {
      type: isResize ? "resize" : "move",
      taskId: task.id,
      startY: event.clientY,
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      moved: false,
      element: taskElement
    };

    event.preventDefault();
    taskElement.setPointerCapture(event.pointerId);
    taskElement.classList.add("dragging");
  }

  function onTaskPointerMove(event) {
    if (!dragState) {
      return;
    }

    var deltaMinutes = Math.round((event.clientY - dragState.startY) / HOUR_HEIGHT * 60 / 15) * 15;
    if (deltaMinutes === 0) {
      return;
    }

    var duration = dragState.endMinutes - dragState.startMinutes;
    var newStart = dragState.startMinutes;
    var newEnd = dragState.endMinutes;

    if (dragState.type === "move") {
      newStart = clamp(dragState.startMinutes + deltaMinutes, 0, 24 * 60 - duration);
      newEnd = newStart + duration;
    } else {
      newEnd = clamp(dragState.endMinutes + deltaMinutes, newStart + 15, 24 * 60);
    }

    if (newEnd <= newStart) {
      return;
    }

    dragState.moved = true;
    var task = findTaskById(dragState.taskId);
    if (!task) {
      return;
    }

    task.start = minutesToTime(newStart);
    task.end = minutesToTime(newEnd);
    dragState.element.style.top = newStart / 60 * HOUR_HEIGHT + "px";
    dragState.element.style.height = Math.max(20, (newEnd - newStart) / 60 * HOUR_HEIGHT - 3) + "px";
    var time = dragState.element.querySelector(".timeline-task-time");
    if (time) {
      time.textContent = task.start + " - " + task.end;
    }
  }

  function onTaskPointerUp() {
    if (!dragState) {
      return;
    }

    dragState.element.classList.remove("dragging");
    if (dragState.moved) {
      suppressTaskClick = true;
      window.setTimeout(function () {
        suppressTaskClick = false;
      }, 0);
      saveState();
      render();
    }
    dragState = null;
  }

  function onTaskClick(event) {
    if (suppressTaskClick) {
      suppressTaskClick = false;
      return;
    }
    var taskElement = event.target.closest(".timeline-task");
    if (taskElement && taskElement.dataset.taskId) {
      openEditModal(taskElement.dataset.taskId);
    }
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
    render();
    showToast("已移动到 " + formatDayHeader(parseDateKey(dateKey)));
  }

  function findTaskById(taskId) {
    return state.tasks.find(function (task) {
      return task.id === taskId;
    });
  }

  function createTaskId() {
    return "task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
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
      repeat: task.repeat || "none",
      reminder: task.reminder || "none",
      tags: task.tags || [],
      location: task.location || "",
      notes: task.notes || "",
      subtasks: task.subtasks || [],
      goalId: task.goalId || null,
      completed: !!task.completed
    };
  }

  function minutesToTime(minutes) {
    return pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function tasksOnDate(dateKey) {
    return state.tasks.filter(function (task) {
      return task.date === dateKey;
    });
  }

  function createSeedTasks() {
    var today = new Date();
    var tomorrow = addDays(today, 1);
    var nextWeek = addDays(today, 7);

    return [
      {
        id: "seed-1",
        date: toDateKey(today),
        title: "产品评审会",
        start: "15:00",
        end: "16:00",
        color: EVENT_COLORS[0]
      },
      {
        id: "seed-2",
        date: toDateKey(today),
        title: "健身",
        start: "19:00",
        end: "20:00",
        color: EVENT_COLORS[1]
      },
      {
        id: "seed-3",
        date: toDateKey(tomorrow),
        title: "六级英语复习",
        start: "20:00",
        end: "21:30",
        color: EVENT_COLORS[2]
      },
      {
        id: "seed-4",
        date: toDateKey(nextWeek),
        title: "社团例会",
        start: "18:30",
        end: "19:30",
        color: EVENT_COLORS[3]
      },
      {
        id: "seed-5",
        date: toDateKey(today),
        title: "阅读精读",
        start: "15:30",
        end: "16:30",
        color: EVENT_COLORS[4]
      }
    ];
  }

  function loadState() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        view: "month",
        selectedDate: toDateKey(new Date()),
        cursor: startOfMonth(new Date()),
        tasks: [],
        granularity: 60,
        goals: [],
        assistant: { enabled: true, frequency: "daily", muted: false },
        examMode: false,
        moodLogs: [],
        diningHalls: [],
        healthProfile: null,
        notificationsEnabled: false,
        aiSettings: { provider: "local", apiKey: "", model: "" }
      };
    }

    try {
      var parsed = JSON.parse(saved);
      return {
        view: parsed.view || "month",
        selectedDate: parsed.selectedDate || toDateKey(new Date()),
        cursor: parsed.cursor ? new Date(parsed.cursor) : startOfMonth(new Date()),
        tasks: (parsed.tasks || []).map(normalizeTask),
        granularity: parsed.granularity || 60,
        goals: parsed.goals || [],
        assistant: parsed.assistant || { enabled: true, frequency: "daily", muted: false },
        examMode: !!parsed.examMode,
        moodLogs: parsed.moodLogs || [],
        diningHalls: parsed.diningHalls || [],
        healthProfile: parsed.healthProfile || null,
        notificationsEnabled: !!parsed.notificationsEnabled,
        aiSettings: parsed.aiSettings || { provider: "local", apiKey: "", model: "" }
      };
    } catch (error) {
      return {
        view: "month",
        selectedDate: toDateKey(new Date()),
        cursor: startOfMonth(new Date()),
        tasks: [],
        granularity: 60,
        goals: [],
        assistant: { enabled: true, frequency: "daily", muted: false },
        examMode: false,
        moodLogs: [],
        diningHalls: [],
        healthProfile: null,
        notificationsEnabled: false,
        aiSettings: { provider: "local", apiKey: "", model: "" }
      };
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        view: state.view,
        selectedDate: state.selectedDate,
        cursor: state.cursor ? state.cursor.toISOString() : null,
        tasks: state.tasks,
        granularity: state.granularity,
        goals: state.goals,
        assistant: state.assistant,
        examMode: state.examMode,
        moodLogs: state.moodLogs,
        diningHalls: state.diningHalls,
        healthProfile: state.healthProfile,
        notificationsEnabled: state.notificationsEnabled,
        aiSettings: state.aiSettings
      })
    );
  }

  function applyTheme() {
    var saved = localStorage.getItem("smart-calendar-theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    els.themeButton.textContent = theme === "dark" ? "浅色" : "深色";
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
    if (!task.start && !task.end) {
      return "全天";
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
