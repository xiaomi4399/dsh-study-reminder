// dsh-study-reminder — browser half.
//
// Registers a global sidebar entry (id `study-reminder`) and the matching main
// panel. All reminder data lives in the host; the panel only calls the same
// origin routes the host registers and never posts into a conversation.
(function () {
  'use strict'

  var React = null

  var ZH = {
    'panel.title': '学习提醒',
    'panel.subtitle': '到点弹出系统桌面卡片并响一声。提醒同步写入 Windows 计划任务，关掉 DSH 也照弹。',
    'nav.label': '学习提醒',
    'action.new': '新建提醒',
    'action.refresh': '刷新',
    'action.sync': '重新同步',
    'action.save': '保存',
    'action.cancel': '取消',
    'action.edit': '编辑',
    'action.delete': '删除',
    'action.test': '测试弹窗',
    'form.new': '新建提醒',
    'form.edit': '编辑提醒',
    'form.time': '时间',
    'form.title': '标题',
    'form.titlePlaceholder': '例如：背单词',
    'form.message': '提醒文案',
    'form.messagePlaceholder': '卡片上显示的详细内容，可以留空。',
    'form.days': '星期几',
    'form.enabled': '启用这条提醒',
    'form.everyday': '每天',
    'form.workdays': '工作日',
    'empty.title': '还没有提醒',
    'empty.desc': '新建一条，比如「每天 21:00 背单词」。到点会弹系统卡片，同时写入计划任务。',
    'empty.cta': '新建第一条提醒',
    'status.synced': '计划任务已同步 · 共 {n} 条',
    'status.failed': '计划任务同步失败',
    'status.pending': '正在同步计划任务…',
    'status.updated': '最近同步 {time}',
    'status.never': '尚未同步',
    'status.data': '数据文件',
    'status.url': 'DSH 地址',
    'task.ok': '任务已注册',
    'task.missing': '任务未注册',
    'task.error': '任务异常',
    'task.disabled': '已停用',
    'next.label': '下次',
    'next.today': '今天',
    'next.tomorrow': '明天',
    'next.none': '暂无',
    'days.everyday': '每天',
    'days.workdays': '工作日',
    'day.1': '周一',
    'day.2': '周二',
    'day.3': '周三',
    'day.4': '周四',
    'day.5': '周五',
    'day.6': '周六',
    'day.7': '周日',
    'confirm.delete': '确定删除「{title}」？删除后对应的 Windows 计划任务也会一起移除。',
    'notice.saved': '已保存，并同步到 Windows 计划任务。',
    'notice.deleted': '已删除，对应的计划任务也已移除。',
    'notice.synced': '计划任务已重新同步。',
    'notice.test': '测试卡片已弹出，点卡片可以回到 DSH。',
    'error.titleRequired': '请填写标题。',
    'error.daysRequired': '至少选择一天。',
    'error.load': '加载失败：{detail}',
    'error.save': '保存失败：{detail}',
    'footer.note': '提醒由 Windows 计划任务触发，不会在对话里发消息。点卡片会打开或唤回 DSH。',
    'aria.enabled': '启用「{title}」',
    'aria.edit': '编辑「{title}」',
    'aria.delete': '删除「{title}」',
    'aria.test': '测试「{title}」',
  }

  var EN = {
    'panel.title': 'Study Reminder',
    'panel.subtitle': 'Pops a system-level desktop card with a sound. Every reminder is mirrored to Windows Task Scheduler, so it still fires when DSH is closed.',
    'nav.label': 'Study Reminder',
    'action.new': 'New reminder',
    'action.refresh': 'Refresh',
    'action.sync': 'Sync tasks',
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.edit': 'Edit',
    'action.delete': 'Delete',
    'action.test': 'Test card',
    'form.new': 'New reminder',
    'form.edit': 'Edit reminder',
    'form.time': 'Time',
    'form.title': 'Title',
    'form.titlePlaceholder': 'For example: Vocabulary',
    'form.message': 'Card message',
    'form.messagePlaceholder': 'Shown on the desktop card. Optional.',
    'form.days': 'Weekdays',
    'form.enabled': 'Enabled',
    'form.everyday': 'Every day',
    'form.workdays': 'Workdays',
    'empty.title': 'No reminders yet',
    'empty.desc': 'Add one, for example “Vocabulary every day at 21:00”. It pops a desktop card and registers a scheduled task.',
    'empty.cta': 'Create the first reminder',
    'status.synced': 'Scheduled tasks synced · {n} total',
    'status.failed': 'Task sync failed',
    'status.pending': 'Syncing scheduled tasks…',
    'status.updated': 'Last sync {time}',
    'status.never': 'Not synced yet',
    'status.data': 'Data file',
    'status.url': 'DSH URL',
    'task.ok': 'Task registered',
    'task.missing': 'Task missing',
    'task.error': 'Task error',
    'task.disabled': 'Disabled',
    'next.label': 'Next',
    'next.today': 'today',
    'next.tomorrow': 'tomorrow',
    'next.none': 'none',
    'days.everyday': 'Every day',
    'days.workdays': 'Workdays',
    'day.1': 'Mon',
    'day.2': 'Tue',
    'day.3': 'Wed',
    'day.4': 'Thu',
    'day.5': 'Fri',
    'day.6': 'Sat',
    'day.7': 'Sun',
    'confirm.delete': 'Delete “{title}”? Its Windows scheduled task is removed as well.',
    'notice.saved': 'Saved and synced to Windows Task Scheduler.',
    'notice.deleted': 'Deleted; the scheduled task is gone too.',
    'notice.synced': 'Scheduled tasks re-synced.',
    'notice.test': 'Test card popped. Click it to return to DSH.',
    'error.titleRequired': 'Title is required.',
    'error.daysRequired': 'Pick at least one weekday.',
    'error.load': 'Load failed: {detail}',
    'error.save': 'Save failed: {detail}',
    'footer.note': 'Reminders are fired by Windows Task Scheduler, never posted into the conversation. Clicking a card opens or raises DSH.',
    'aria.enabled': 'Enable “{title}”',
    'aria.edit': 'Edit “{title}”',
    'aria.delete': 'Delete “{title}”',
    'aria.test': 'Test “{title}”',
  }

  var CSS = [
    '.sr-page{box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;padding:28px clamp(20px,4vw,56px) 44px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;line-height:1.5}',
    '.sr-inner{max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:16px}',
    '.sr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}',
    '.sr-head h1{margin:0;font-size:22px;line-height:30px;font-weight:600;letter-spacing:.01em}',
    '.sr-head p{margin:6px 0 0;max-width:640px;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6}',
    '.sr-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.sr-btn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:18px;border-radius:8px;padding:6px 12px;cursor:pointer;transition:border-color .15s ease,background-color .15s ease,opacity .15s ease;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}',
    '.sr-btn:hover:not(:disabled){border-color:var(--dsw-alias-label-secondary)}',
    '.sr-btn:disabled{opacity:.5;cursor:default}',
    '.sr-btn-primary{background:#2f7cf6;border-color:#2f7cf6;color:#fff;font-weight:500}',
    '.sr-btn-primary:hover:not(:disabled){border-color:#2f7cf6;filter:brightness(1.06)}',
    '.sr-btn-danger{color:var(--dsw-alias-state-error-primary)}',
    '.sr-btn-danger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary)}',
    '.sr-btn-quiet{background:transparent}',
    '.sr-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}',
    '.sr-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}',
    '.sr-dot.ok{background:var(--dsw-alias-state-success-primary)}',
    '.sr-dot.err{background:var(--dsw-alias-state-error-primary)}',
    '.sr-dot.busy{background:var(--dsw-alias-state-warn-primary)}',
    '.sr-sep{opacity:.45}',
    '.sr-spacer{flex:1 1 auto}',
    '.sr-banner{border-radius:9px;padding:9px 12px;font-size:12.5px;line-height:1.55;border:1px solid var(--dsw-alias-border-l2)}',
    '.sr-banner-error{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}',
    '.sr-banner-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 7%,transparent)}',
    '.sr-errors{margin:8px 0 0;padding:0 0 0 18px;color:var(--dsw-alias-state-error-primary);font-size:11.5px}',
    '.sr-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);padding:16px 18px}',
    '.sr-form{display:flex;flex-direction:column;gap:14px;border-color:rgba(47,124,246,.38)}',
    '.sr-form-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:600}',
    '.sr-grid{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:12px}',
    '.sr-grid-wide{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}',
    '.sr-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.sr-field > label{color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:500;letter-spacing:.02em}',
    '.sr-input,.sr-textarea,.sr-time{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:7px 10px;outline:none;transition:border-color .15s ease}',
    '.sr-input:focus,.sr-textarea:focus,.sr-time:focus{border-color:#2f7cf6}',
    '.sr-textarea{resize:vertical;min-height:68px;line-height:1.55}',
    '.sr-time{font-variant-numeric:tabular-nums;letter-spacing:.04em}',
    '.sr-days{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.sr-day{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;border-radius:999px;padding:4px 11px;cursor:pointer;transition:all .15s ease}',
    '.sr-day:hover{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}',
    '.sr-day.on{background:rgba(47,124,246,.18);border-color:rgba(47,124,246,.62);color:var(--dsw-alias-label-primary);font-weight:600}',
    '.sr-presets{display:flex;gap:6px;margin-left:4px}',
    '.sr-link{background:none;border:0;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
    '.sr-link:hover{color:var(--dsw-alias-label-primary)}',
    '.sr-form-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px}',
    '.sr-check{display:inline-flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none}',
    '.sr-check input{width:15px;height:15px;accent-color:#2f7cf6}',
    '.sr-list{display:flex;flex-direction:column;gap:10px}',
    '.sr-row{display:flex;align-items:flex-start;gap:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;transition:border-color .15s ease,opacity .15s ease}',
    '.sr-row:hover{border-color:var(--dsw-alias-label-tertiary,var(--dsw-alias-border-l2))}',
    '.sr-row[data-off="true"]{opacity:.55}',
    '.sr-clock{flex:none;width:78px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding-top:1px}',
    '.sr-clock b{font-size:25px;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:.02em;font-weight:600}',
    '.sr-clock span{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
    '.sr-row-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px}',
    '.sr-row-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
    '.sr-row-title h3{margin:0;font-size:14px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}',
    '.sr-badge{flex:none;font-size:10.5px;line-height:16px;border-radius:999px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
    '.sr-badge.ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,transparent)}',
    '.sr-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}',
    '.sr-badge.err{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}',
    '.sr-row-msg{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.sr-row-meta{color:var(--dsw-alias-label-secondary);font-size:11.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.sr-row-actions{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.sr-switch{position:relative;display:inline-flex;align-items:center;width:36px;height:20px;flex:none;cursor:pointer}',
    '.sr-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}',
    '.sr-switch i{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-state-idle-primary);opacity:.45;transition:background .15s ease,opacity .15s ease}',
    '.sr-switch i:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.3)}',
    '.sr-switch input:checked + i{background:#2f7cf6;opacity:1}',
    '.sr-switch input:checked + i:after{transform:translateX(16px)}',
    '.sr-switch input:focus-visible + i{outline:2px solid #2f7cf6;outline-offset:2px}',
    '.sr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:14px;padding:48px 20px;color:var(--dsw-alias-label-secondary)}',
    '.sr-empty svg{opacity:.5}',
    '.sr-empty h3{margin:0;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600}',
    '.sr-empty p{margin:0;max-width:440px;font-size:12.5px;line-height:1.6}',
    '.sr-footer{border-top:1px solid var(--dsw-alias-border-l1);padding-top:14px;display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.6}',
    '.sr-kv{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}',
    '.sr-kv b{font-weight:500;color:var(--dsw-alias-label-secondary);flex:none}',
    '.sr-kv code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 6px;overflow-wrap:anywhere;word-break:break-all}',
    '.sr-loading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:28px 0}',
    '@media (max-width:720px){.sr-grid{grid-template-columns:minmax(0,1fr)}.sr-row{flex-wrap:wrap}.sr-row-actions{width:100%;justify-content:flex-start}.sr-clock{width:auto;min-width:64px}}',
  ].join('\n')

  var WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

  function api(path, body) {
    var options = body === undefined
      ? { method: 'GET', cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dsh-study-reminder': '1' },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
    return fetch('/__dsh-study-reminder/' + path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (payload) {
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || ('HTTP ' + response.status))
        }
        return payload
      })
    })
  }

  function formatNext(iso, t) {
    if (!iso) return t('next.none')
    var date = new Date(iso)
    if (isNaN(date.getTime())) return t('next.none')
    var now = new Date()
    var clock = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
    if (date.toDateString() === now.toDateString()) return t('next.today') + ' ' + clock
    var tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    if (date.toDateString() === tomorrow.toDateString()) return t('next.tomorrow') + ' ' + clock
    return (date.getMonth() + 1) + '/' + date.getDate() + ' ' + clock
  }

  function formatClock(iso) {
    if (!iso) return ''
    var date = new Date(iso)
    if (isNaN(date.getTime())) return ''
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
  }

  function daysText(days, t) {
    var sorted = (days || []).slice().sort(function (a, b) { return a - b })
    if (sorted.length === 7) return t('days.everyday')
    if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return t('days.workdays')
    return sorted.map(function (day) { return t('day.' + day) }).join(' · ')
  }

  function StudyIcon(props) {
    var size = props && props.size ? props.size : 20
    return React.createElement('svg', {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      style: { display: 'block' },
    },
      React.createElement('path', { d: 'M12 3.4a6.5 6.5 0 0 0-6.5 6.5v3.9L4 16.6h16l-1.5-2.8V9.9A6.5 6.5 0 0 0 12 3.4Z' }),
      React.createElement('path', { d: 'M9.5 19.6a2.7 2.7 0 0 0 5 0' }),
      React.createElement('path', { d: 'M12 1.6v1.2' })
    )
  }

  function EmptyState(props) {
    var t = props.t
    return React.createElement('div', { className: 'sr-empty' },
      React.createElement('svg', {
        viewBox: '0 0 24 24', width: 46, height: 46, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        React.createElement('path', { d: 'M12 3.4a6.5 6.5 0 0 0-6.5 6.5v3.9L4 16.6h16l-1.5-2.8V9.9A6.5 6.5 0 0 0 12 3.4Z' }),
        React.createElement('path', { d: 'M9.5 19.6a2.7 2.7 0 0 0 5 0' })
      ),
      React.createElement('h3', null, t('empty.title')),
      React.createElement('p', null, t('empty.desc')),
      React.createElement('button', { type: 'button', className: 'sr-btn sr-btn-primary', onClick: props.onCreate }, t('empty.cta'))
    )
  }

  function ReminderRow(props) {
    var reminder = props.reminder
    var task = props.task
    var t = props.t
    var badge = null
    if (!reminder.enabled) {
      badge = React.createElement('span', { className: 'sr-badge' }, t('task.disabled'))
    } else if (!task) {
      badge = React.createElement('span', { className: 'sr-badge warn' }, t('task.missing'))
    } else if (task.state === 'Error') {
      badge = React.createElement('span', { className: 'sr-badge err', title: task.error || '' }, t('task.error'))
    } else {
      badge = React.createElement('span', { className: 'sr-badge ok' }, t('task.ok'))
    }

    return React.createElement('article', { className: 'sr-row', 'data-off': reminder.enabled ? 'false' : 'true' },
      React.createElement('div', { className: 'sr-clock' },
        React.createElement('b', null, reminder.time),
        React.createElement('span', null, daysText(reminder.days, t))
      ),
      React.createElement('div', { className: 'sr-row-main' },
        React.createElement('div', { className: 'sr-row-title' },
          React.createElement('h3', null, reminder.title),
          badge
        ),
        reminder.message ? React.createElement('p', { className: 'sr-row-msg' }, reminder.message) : null,
        React.createElement('div', { className: 'sr-row-meta' },
          React.createElement('span', null, t('next.label') + ' ' + formatNext(reminder.nextRunAt, t))
        )
      ),
      React.createElement('div', { className: 'sr-row-actions' },
        React.createElement('button', {
          type: 'button', className: 'sr-btn sr-btn-quiet', disabled: props.busy,
          'aria-label': t('aria.test', { title: reminder.title }),
          onClick: function () { props.onTest(reminder) },
        }, t('action.test')),
        React.createElement('button', {
          type: 'button', className: 'sr-btn sr-btn-quiet', disabled: props.busy,
          'aria-label': t('aria.edit', { title: reminder.title }),
          onClick: function () { props.onEdit(reminder) },
        }, t('action.edit')),
        React.createElement('button', {
          type: 'button', className: 'sr-btn sr-btn-quiet sr-btn-danger', disabled: props.busy,
          'aria-label': t('aria.delete', { title: reminder.title }),
          onClick: function () { props.onDelete(reminder) },
        }, t('action.delete')),
        React.createElement('label', { className: 'sr-switch', title: t('aria.enabled', { title: reminder.title }) },
          React.createElement('input', {
            type: 'checkbox', checked: reminder.enabled, disabled: props.busy,
            'aria-label': t('aria.enabled', { title: reminder.title }),
            onChange: function () { props.onToggle(reminder) },
          }),
          React.createElement('i')
        )
      )
    )
  }

  function DraftForm(props) {
    var draft = props.draft
    var t = props.t
    var update = function (patch) { props.onChange(Object.assign({}, draft, patch)) }
    var toggleDay = function (day) {
      var days = draft.days.indexOf(day) >= 0
        ? draft.days.filter(function (item) { return item !== day })
        : draft.days.concat([day]).sort(function (a, b) { return a - b })
      update({ days: days })
    }
    var setDays = function (days) { update({ days: days }) }

    return React.createElement('form', {
      className: 'sr-card sr-form',
      onSubmit: function (event) { event.preventDefault(); props.onSave() },
    },
      React.createElement('div', { className: 'sr-form-title' },
        React.createElement('span', null, draft.id ? t('form.edit') : t('form.new')),
        React.createElement('button', {
          type: 'button', className: 'sr-btn sr-btn-quiet', disabled: props.busy, onClick: props.onCancel,
        }, t('action.cancel'))
      ),
      React.createElement('div', { className: 'sr-grid' },
        React.createElement('div', { className: 'sr-field' },
          React.createElement('label', { htmlFor: 'sr-title' }, t('form.title')),
          React.createElement('input', {
            id: 'sr-title', className: 'sr-input', type: 'text', maxLength: 80, required: true,
            placeholder: t('form.titlePlaceholder'), value: draft.title,
            onChange: function (event) { update({ title: event.target.value }) },
          })
        ),
        React.createElement('div', { className: 'sr-field' },
          React.createElement('label', { htmlFor: 'sr-time' }, t('form.time')),
          React.createElement('input', {
            id: 'sr-time', className: 'sr-time', type: 'time', required: true, value: draft.time,
            onChange: function (event) { update({ time: event.target.value }) },
          })
        )
      ),
      React.createElement('div', { className: 'sr-field' },
        React.createElement('label', { htmlFor: 'sr-message' }, t('form.message')),
        React.createElement('textarea', {
          id: 'sr-message', className: 'sr-textarea', maxLength: 600, rows: 3,
          placeholder: t('form.messagePlaceholder'), value: draft.message,
          onChange: function (event) { update({ message: event.target.value }) },
        })
      ),
      React.createElement('div', { className: 'sr-field' },
        React.createElement('label', null, t('form.days')),
        React.createElement('div', { className: 'sr-days' },
          WEEKDAYS.map(function (day) {
            return React.createElement('button', {
              key: day, type: 'button',
              className: 'sr-day' + (draft.days.indexOf(day) >= 0 ? ' on' : ''),
              'aria-pressed': draft.days.indexOf(day) >= 0,
              onClick: function () { toggleDay(day) },
            }, t('day.' + day))
          }),
          React.createElement('span', { className: 'sr-presets' },
            React.createElement('button', { type: 'button', className: 'sr-link', onClick: function () { setDays([1, 2, 3, 4, 5, 6, 7]) } }, t('form.everyday')),
            React.createElement('button', { type: 'button', className: 'sr-link', onClick: function () { setDays([1, 2, 3, 4, 5]) } }, t('form.workdays'))
          )
        )
      ),
      React.createElement('div', { className: 'sr-form-foot' },
        React.createElement('label', { className: 'sr-check' },
          React.createElement('input', {
            type: 'checkbox', checked: draft.enabled,
            onChange: function (event) { update({ enabled: event.target.checked }) },
          }),
          t('form.enabled')
        ),
        React.createElement('span', { className: 'sr-spacer' }),
        React.createElement('button', { type: 'submit', className: 'sr-btn sr-btn-primary', disabled: props.busy }, t('action.save'))
      )
    )
  }

  function Panel(props) {
    var t = props.t
    var stateHook = React.useState(null)
    var data = stateHook[0]
    var setData = stateHook[1]
    var errorHook = React.useState('')
    var error = errorHook[0]
    var setError = errorHook[1]
    var noticeHook = React.useState('')
    var notice = noticeHook[0]
    var setNotice = noticeHook[1]
    var draftHook = React.useState(null)
    var draft = draftHook[0]
    var setDraft = draftHook[1]
    var busyHook = React.useState('')
    var busy = busyHook[0]
    var setBusy = busyHook[1]
    var loadingHook = React.useState(true)
    var loading = loadingHook[0]
    var setLoading = loadingHook[1]

    var load = React.useCallback(function () {
      setLoading(true)
      setError('')
      return api('state').then(function (payload) {
        setData(payload.state)
      }).catch(function (failure) {
        setError(t('error.load', { detail: String(failure && failure.message ? failure.message : failure) }))
      }).then(function () {
        setLoading(false)
      })
    }, [t])

    React.useEffect(function () {
      var alive = true
      setLoading(true)
      api('state').then(function (payload) {
        if (alive) setData(payload.state)
      }).catch(function (failure) {
        if (alive) setError(t('error.load', { detail: String(failure && failure.message ? failure.message : failure) }))
      }).then(function () {
        if (alive) setLoading(false)
      })
      return function () { alive = false }
    }, [t])

    var run = function (label, operation) {
      setBusy(label)
      setError('')
      setNotice('')
      return operation().catch(function (failure) {
        setError(String(failure && failure.message ? failure.message : failure))
        throw failure
      }).then(function (result) {
        if (result && result.state) setData(result.state)
        if (result && result.notice) setNotice(result.notice)
        return result
      }).then(function (result) {
        setBusy('')
        return result
      }, function (failure) {
        setBusy('')
        throw failure
      })
    }

    var openNew = function () {
      var next = new Date(Date.now() + 5 * 60 * 1000)
      next.setSeconds(0, 0)
      var clock = String(next.getHours()).padStart(2, '0') + ':' + String(next.getMinutes()).padStart(2, '0')
      setDraft({ id: '', title: '', message: '', time: clock, days: [1, 2, 3, 4, 5, 6, 7], enabled: true, seconds: 30, position: 'bottomright' })
      setError('')
      setNotice('')
    }

    var openEdit = function (reminder) {
      setDraft({
        id: reminder.id, title: reminder.title, message: reminder.message || '', time: reminder.time,
        days: reminder.days.slice(), enabled: reminder.enabled,
        seconds: reminder.seconds || 30, position: reminder.position || 'bottomright', legacyTask: reminder.legacyTask || null,
      })
      setError('')
      setNotice('')
    }

    var saveDraft = function () {
      if (!draft) return Promise.resolve()
      if (!String(draft.title || '').trim()) { setError(t('error.titleRequired')); return Promise.resolve() }
      if (!draft.days || draft.days.length === 0) { setError(t('error.daysRequired')); return Promise.resolve() }
      return run('save', function () {
        return api('save', { reminder: draft }).then(function (payload) {
          setDraft(null)
          return { state: payload.state, notice: t('notice.saved') }
        })
      }).catch(function () {})
    }

    var removeReminder = function (reminder) {
      if (typeof window.confirm === 'function' && !window.confirm(t('confirm.delete', { title: reminder.title }))) return
      run('delete', function () {
        return api('delete', { id: reminder.id }).then(function (payload) {
          if (draft && draft.id === reminder.id) setDraft(null)
          return { state: payload.state, notice: t('notice.deleted') }
        })
      }).catch(function () {})
    }

    var toggleReminder = function (reminder) {
      run('toggle', function () {
        var next = Object.assign({}, reminder, { enabled: !reminder.enabled, nextRunAt: undefined })
        return api('save', { reminder: next }).then(function (payload) {
          return { state: payload.state }
        })
      }).catch(function () {})
    }

    var testReminder = function (reminder) {
      run('test', function () {
        return api('test', { id: reminder.id }).then(function () {
          return { notice: t('notice.test') }
        })
      }).catch(function () {})
    }

    var syncNow = function () {
      run('sync', function () {
        return api('sync').then(function (payload) {
          return { state: payload.state, notice: t('notice.synced') }
        })
      }).catch(function () {})
    }

    var reminders = data && Array.isArray(data.reminders) ? data.reminders : []
    var tasks = data && Array.isArray(data.tasks) ? data.tasks : []
    var lastSync = data ? data.lastSync : null
    var syncErrors = lastSync && Array.isArray(lastSync.errors) ? lastSync.errors : []
    var syncedCount = tasks.filter(function (task) { return task && task.state !== 'Disabled' && task.state !== 'Error' }).length
    var syncing = busy === 'sync'
    var statusClass = syncing ? 'busy' : (lastSync && lastSync.ok ? 'ok' : (lastSync ? 'err' : ''))
    var statusText = !lastSync
      ? t('status.never')
      : (syncing ? t('status.pending') : (lastSync.ok ? t('status.synced', { n: syncedCount }) : t('status.failed')))

    return React.createElement('div', { className: 'sr-page' },
      React.createElement('style', null, CSS),
      React.createElement('div', { className: 'sr-inner' },
        React.createElement('header', { className: 'sr-head' },
          React.createElement('div', null,
            React.createElement('h1', null, t('panel.title')),
            React.createElement('p', null, t('panel.subtitle'))
          ),
          React.createElement('div', { className: 'sr-head-actions' },
            React.createElement('button', { type: 'button', className: 'sr-btn', disabled: busy || loading, onClick: function () { load() } }, t('action.refresh')),
            React.createElement('button', { type: 'button', className: 'sr-btn', disabled: busy || loading, onClick: syncNow }, t('action.sync')),
            React.createElement('button', { type: 'button', className: 'sr-btn sr-btn-primary', disabled: busy, onClick: openNew }, t('action.new'))
          )
        ),

        React.createElement('div', { className: 'sr-status' },
          React.createElement('span', { className: 'sr-dot ' + statusClass }),
          React.createElement('span', null, statusText),
          lastSync && lastSync.at ? React.createElement('span', { className: 'sr-sep' }, '·') : null,
          lastSync && lastSync.at ? React.createElement('span', null, t('status.updated', { time: formatClock(lastSync.at) })) : null,
          React.createElement('span', { className: 'sr-spacer' }),
          React.createElement('span', null, reminders.length + ' / ' + tasks.length)
        ),

        error ? React.createElement('div', { className: 'sr-banner sr-banner-error', role: 'alert' }, error) : null,
        notice ? React.createElement('div', { className: 'sr-banner sr-banner-ok', role: 'status' }, notice) : null,
        syncErrors.length > 0 ? React.createElement('div', { className: 'sr-banner sr-banner-error', role: 'alert' },
          React.createElement('div', null, t('status.failed')),
          React.createElement('ul', { className: 'sr-errors' },
            syncErrors.slice(0, 6).map(function (item, index) {
              return React.createElement('li', { key: index }, (item.id ? item.id + ': ' : '') + (item.message || ''))
            })
          )
        ) : null,

        draft ? React.createElement(DraftForm, {
          draft: draft, t: t, busy: !!busy,
          onChange: setDraft,
          onCancel: function () { setDraft(null) },
          onSave: saveDraft,
        }) : null,

        loading && !data ? React.createElement('div', { className: 'sr-loading', role: 'status' }, t('status.pending')) : null,

        reminders.length === 0 && !loading
          ? React.createElement(EmptyState, { t: t, onCreate: openNew })
          : React.createElement('div', { className: 'sr-list' },
              reminders.map(function (reminder) {
                var task = null
                for (var index = 0; index < tasks.length; index += 1) {
                  if (tasks[index] && tasks[index].id === reminder.id) { task = tasks[index]; break }
                }
                return React.createElement(ReminderRow, {
                  key: reminder.id, reminder: reminder, task: task, t: t, busy: !!busy,
                  onEdit: openEdit, onDelete: removeReminder, onToggle: toggleReminder, onTest: testReminder,
                })
              })
            ),

        React.createElement('footer', { className: 'sr-footer' },
          React.createElement('div', null, t('footer.note')),
          data && data.dataPath ? React.createElement('div', { className: 'sr-kv' },
            React.createElement('b', null, t('status.data')),
            React.createElement('code', null, data.dataPath)
          ) : null,
          data && data.dshUrl ? React.createElement('div', { className: 'sr-kv' },
            React.createElement('b', null, t('status.url')),
            React.createElement('code', null, data.dshUrl)
          ) : null
        )
      )
    )
  }

  function apply(ctx) {
    ctx.effect(function () {
      return ctx.locale.register('study-reminder', { zh: ZH, en: EN })
    }, 'dsh-study-reminder: locale dictionaries')

    var t = ctx.locale.bind('study-reminder')

    ctx.slots.inject('main', function () {
      return ctx.slots.register({
        name: 'main',
        key: 'study-reminder',
        locale: 'study-reminder',
      }, function (props) {
        return React.createElement(Panel, Object.assign({}, props, { t: t }))
      })
    })

    ctx.slots.inject('sidebar.panellist', function () {
      return ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'study-reminder',
        order: 40,
        label: function () { return t('nav.label') },
        locale: 'study-reminder',
      }, StudyIcon)
    })
  }

  window.__ModuleLoader__.load({
    id: 'dsh-study-reminder',
    factory: function (require) {
      React = require('react')
      return {
        inject: ['slots', 'locale'],
        apply: apply,
      }
    },
  })
})()
