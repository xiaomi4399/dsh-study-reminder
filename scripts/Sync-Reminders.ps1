param(
    [Parameter(Mandatory = $true)][string]$DataPath,
    [Parameter(Mandatory = $true)][string]$PopupScript,
    [Parameter(Mandatory = $true)][string]$FocusScript,
    [Parameter(Mandatory = $true)][string]$ConfigDir,
    [Parameter(Mandatory = $true)][string]$LogDir,
    [string]$AppPath = '',
    [string]$DshUrl = '',
    [int]$Migrated = 0
)

# ASCII-only Windows PowerShell 5.1 script. Chinese reminder text is read from
# the UTF-8 data file; the script never embeds non-ASCII source.
#
# The Task Scheduler CIM provider is slow (about 2 s per enumeration on this
# host), so every existing task is read exactly once and unchanged tasks are
# NOT re-registered: only action, trigger time, weekdays and enabled state are
# compared. Title/message edits only rewrite the per-reminder popup JSON.

$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$result = [ordered]@{
    ok            = $true
    tasks         = @()
    removed       = @()
    legacyRemoved = @()
    errors        = @()
    configDir     = $ConfigDir
    elapsedMs     = 0
}

$DayNames = @{
    1 = 'Monday'
    2 = 'Tuesday'
    3 = 'Wednesday'
    4 = 'Thursday'
    5 = 'Friday'
    6 = 'Saturday'
    7 = 'Sunday'
}

$PowerShellExe = 'C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe'
$TaskPrefix = 'DSH Study Reminder - '

function Get-TriggerLocalTime($Trigger) {
    if ($null -eq $Trigger) { return '' }
    $raw = [string]$Trigger.StartBoundary
    if ([string]::IsNullOrWhiteSpace($raw)) { return '' }
    try {
        if ($raw -match '(Z|[+-]\d{2}:\d{2})$') {
            $offset = [System.DateTimeOffset]::Parse($raw, [System.Globalization.CultureInfo]::InvariantCulture)
            return $offset.LocalDateTime.ToString('HH:mm')
        }
        $local = [System.DateTime]::Parse($raw, [System.Globalization.CultureInfo]::InvariantCulture)
        return $local.ToString('HH:mm')
    } catch {
        return ''
    }
}

function Get-TriggerMask($Trigger) {
    try {
        if ($null -ne $Trigger.DaysOfWeek) { return [int]$Trigger.DaysOfWeek }
    } catch { }
    return 0
}

function Get-DaysMask([int[]]$Days) {
    $bits = @{ 1 = 2; 2 = 4; 3 = 8; 4 = 16; 5 = 32; 6 = 64; 7 = 1 }
    $mask = 0
    foreach ($day in $Days) { $mask = $mask -bor [int]$bits[[int]$day] }
    return $mask
}

try {
    $data = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    $result.ok = $false
    $result.errors += [ordered]@{ id = $null; message = ('cannot read data file: ' + $_.Exception.Message) }
    $result.elapsedMs = $stopwatch.ElapsedMilliseconds
    $result | ConvertTo-Json -Depth 8 -Compress
    exit 0
}

$hint = 'Click the card to open DSH'
if ($data.PSObject.Properties.Name -contains 'popupHint' -and -not [string]::IsNullOrWhiteSpace([string]$data.popupHint)) {
    $hint = [string]$data.popupHint
}

try { New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null } catch { }
try { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null } catch { }

$reminders = @()
if ($data.PSObject.Properties.Name -contains 'reminders') {
    $reminders = @($data.reminders)
}
$reminders = @($reminders | Where-Object { $null -ne $_ })

# One Task Scheduler read for the whole reconcile pass.
$allTasks = @()
try {
    $allTasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue)
} catch {
    $result.ok = $false
    $result.errors += [ordered]@{ id = $null; message = ('cannot enumerate scheduled tasks: ' + $_.Exception.Message) }
}
$existing = @($allTasks | Where-Object { $_.TaskName -like ($TaskPrefix + '*') })
$legacy = @($allTasks | Where-Object { $_.TaskName -like 'DSH Reminder - *' -and $_.TaskName -notlike 'DSH Study Reminder*' })
$existingByName = @{}
foreach ($task in $existing) { $existingByName[[string]$task.TaskName] = $task }

$keep = @{}
foreach ($reminder in $reminders) {
    $id = [string]$reminder.id
    if ([string]::IsNullOrWhiteSpace($id)) { continue }
    $keep[$TaskPrefix + $id] = $true
}

foreach ($reminder in $reminders) {
    $id = [string]$reminder.id
    if ([string]::IsNullOrWhiteSpace($id)) {
        $result.ok = $false
        $result.errors += [ordered]@{ id = $null; message = 'reminder without id' }
        continue
    }

    $safeId = $id -replace '[^A-Za-z0-9._-]', '_'
    $taskName = $TaskPrefix + $id
    $configPath = Join-Path $ConfigDir ($safeId + '.json')

    $enabled = $true
    if ($reminder.PSObject.Properties.Name -contains 'enabled' -and $reminder.enabled -eq $false) { $enabled = $false }

    if (-not $enabled) {
        $current = $existingByName[$taskName]
        if ($null -ne $current) {
            try {
                Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
                $result.removed += $taskName
            } catch {
                $result.ok = $false
                $result.errors += [ordered]@{ id = $id; message = ('cannot remove disabled task: ' + $_.Exception.Message) }
            }
        }
        if (Test-Path -LiteralPath $configPath) {
            try { Remove-Item -LiteralPath $configPath -Force } catch { }
        }
        $result.tasks += [ordered]@{
            id = $id; name = $taskName; state = 'Disabled'; time = [string]$reminder.time; days = @(); enabled = $false
        }
        continue
    }

    $time = [string]$reminder.time
    if ($time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') {
        $result.ok = $false
        $result.errors += [ordered]@{ id = $id; message = ('invalid time: ' + $time) }
        continue
    }

    $days = @()
    if ($reminder.PSObject.Properties.Name -contains 'days') {
        $days = @($reminder.days | ForEach-Object { [int]$_ } | Where-Object { $_ -ge 1 -and $_ -le 7 } | Sort-Object -Unique)
    }
    if ($days.Count -eq 0) {
        $result.ok = $false
        $result.errors += [ordered]@{ id = $id; message = 'no valid weekdays' }
        continue
    }

    $seconds = 30
    if ($reminder.PSObject.Properties.Name -contains 'seconds' -and $reminder.seconds) {
        $seconds = [int]$reminder.seconds
    }
    if ($seconds -lt 5) { $seconds = 5 }
    if ($seconds -gt 180) { $seconds = 180 }

    $position = 'bottomright'
    if ($reminder.PSObject.Properties.Name -contains 'position' -and [string]$reminder.position -eq 'center') {
        $position = 'center'
    }

    $payload = [ordered]@{
        id          = $id
        title       = [string]$reminder.title
        message     = [string]$reminder.message
        hint        = $hint
        seconds     = $seconds
        position    = $position
        focusScript = $FocusScript
        dataDir     = (Split-Path -Parent $DataPath)
        logDir      = $LogDir
        dshUrl      = $DshUrl
        appPath     = $AppPath
        time        = $time
        days        = $days
    }
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($configPath, ($payload | ConvertTo-Json -Depth 6), $utf8NoBom)
    } catch {
        $result.ok = $false
        $result.errors += [ordered]@{ id = $id; message = ('cannot write popup config: ' + $_.Exception.Message) }
        continue
    }

    # Compare the live task with the desired action/trigger; skip unchanged.
    $current = $existingByName[$taskName]
    $skip = $false
    if ($null -ne $current -and [string]$current.State -ne 'Disabled') {
        $trigger = $null
        try { if (@($current.Triggers).Count -gt 0) { $trigger = @($current.Triggers)[0] } } catch { }
        $argText = ''
        try {
            foreach ($action in @($current.Actions)) {
                if ($null -ne $action.Arguments) { $argText = [string]$action.Arguments; break }
            }
        } catch { }
        $needle = ('-configpath "' + $configPath + '"').ToLowerInvariant()
        $actionMatch = $argText.ToLowerInvariant().Contains($needle)
        $timeMatch = ((Get-TriggerLocalTime $trigger) -eq $time)
        if ($days.Count -ge 7) {
            $daysMatch = ((Get-TriggerMask $trigger) -eq 0 -or (Get-TriggerMask $trigger) -eq 127)
        } else {
            $daysMatch = ((Get-TriggerMask $trigger) -eq (Get-DaysMask $days))
        }
        $skip = ($actionMatch -and $timeMatch -and $daysMatch)
    }

    if ($skip) {
        $result.tasks += [ordered]@{
            id = $id; name = $taskName; state = [string]$current.State; time = $time; days = $days; enabled = $true; configPath = $configPath
        }
        continue
    }

    try {
        if ($days.Count -ge 7) {
            $trigger = New-ScheduledTaskTrigger -Daily -At $time
        } else {
            $dayNames = @($days | ForEach-Object { $DayNames[$_] })
            $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dayNames -At $time
        }

        $argument = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PopupScript + '" -ConfigPath "' + $configPath + '"'
        $action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $argument -WorkingDirectory (Split-Path -Parent $PopupScript)
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

        $registered = Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description ('Study reminder ' + $id) -Force
        $state = 'Ready'
        if ($null -ne $registered -and $null -ne $registered.State) { $state = [string]$registered.State }

        $result.tasks += [ordered]@{
            id = $id; name = $taskName; state = $state; time = $time; days = $days; enabled = $true; configPath = $configPath
        }
    } catch {
        $result.ok = $false
        $message = $_.Exception.Message
        $result.errors += [ordered]@{ id = $id; message = ('cannot register task: ' + $message) }
        $result.tasks += [ordered]@{
            id = $id; name = $taskName; state = 'Error'; time = $time; days = $days; enabled = $true; error = $message
        }
    }
}

# Remove tasks this plugin no longer owns (renamed or deleted reminders).
foreach ($task in $existing) {
    if (-not $keep.ContainsKey($task.TaskName)) {
        try {
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false
            $result.removed += $task.TaskName
        } catch {
            $result.ok = $false
            $result.errors += [ordered]@{ id = $null; message = ('cannot remove stale task ' + $task.TaskName + ': ' + $_.Exception.Message) }
        }
    }
}

# Remove stale per-reminder config files.
try {
    $keepFiles = @{}
    foreach ($reminder in $reminders) {
        $safeId = ([string]$reminder.id) -replace '[^A-Za-z0-9._-]', '_'
        $keepFiles[($safeId + '.json')] = $true
    }
    foreach ($file in @(Get-ChildItem -LiteralPath $ConfigDir -Filter '*.json' -File -ErrorAction SilentlyContinue)) {
        if ($file.Name -eq '_test.json') { continue }
        if (-not $keepFiles.ContainsKey($file.Name)) {
            try { Remove-Item -LiteralPath $file.FullName -Force } catch { }
        }
    }
} catch { }

# One-time takeover of the pre-plugin tasks, so nothing fires twice.
if ($Migrated -eq 1) {
    foreach ($task in $legacy) {
        try {
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false
            $result.legacyRemoved += $task.TaskName
        } catch {
            $result.ok = $false
            $result.errors += [ordered]@{ id = $null; message = ('cannot remove legacy task ' + $task.TaskName + ': ' + $_.Exception.Message) }
        }
    }
}

if (@($result.errors).Count -gt 0) { $result.ok = $false }

$result.elapsedMs = $stopwatch.ElapsedMilliseconds
$result | ConvertTo-Json -Depth 8 -Compress
exit 0
