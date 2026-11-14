param(
    [string]$LogDir = ''
)

# ASCII-only Windows PowerShell 5.1 script. Reads the pre-plugin
# "DSH Reminder - *" scheduled tasks and returns them as plugin reminders so
# the first activation can take them over instead of leaving duplicates.

$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

$result = [ordered]@{
    ok          = $true
    legacyCount = 0
    reminders   = @()
    errors      = @()
}

$TaskPrefix = 'DSH Reminder - '

function Convert-TriggerTime([string]$StartBoundary, $Trigger) {
    $raw = [string]$StartBoundary
    if ([string]::IsNullOrWhiteSpace($raw) -and $null -ne $Trigger) {
        try { $raw = [string]$Trigger.StartBoundary } catch { }
    }
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

function Convert-TriggerDays($Trigger) {
    $mask = 0
    try {
        if ($null -ne $Trigger -and $null -ne $Trigger.DaysOfWeek) {
            $mask = [int]$Trigger.DaysOfWeek
        }
    } catch {
        $mask = 0
    }
    if ($mask -le 0) { return @(1, 2, 3, 4, 5, 6, 7) }
    $days = @()
    $bits = @(
        @{ Bit = 1; Day = 7 },
        @{ Bit = 2; Day = 1 },
        @{ Bit = 4; Day = 2 },
        @{ Bit = 8; Day = 3 },
        @{ Bit = 16; Day = 4 },
        @{ Bit = 32; Day = 5 },
        @{ Bit = 64; Day = 6 }
    )
    foreach ($entry in $bits) {
        if (($mask -band [int]$entry.Bit) -ne 0) { $days += [int]$entry.Day }
    }
    if ($days.Count -eq 0) { return @(1, 2, 3, 4, 5, 6, 7) }
    return @($days | Sort-Object -Unique)
}

function Get-ConfigPath([string]$Arguments) {
    if ([string]::IsNullOrWhiteSpace($Arguments)) { return '' }
    $match = [regex]::Match($Arguments, '-ConfigPath\s+"([^"]+)"')
    if ($match.Success) { return $match.Groups[1].Value }
    $match = [regex]::Match($Arguments, "-ConfigPath\s+'([^']+)'")
    if ($match.Success) { return $match.Groups[1].Value }
    $match = [regex]::Match($Arguments, '-ConfigPath\s+(\S+)')
    if ($match.Success) { return $match.Groups[1].Value.Trim('"', "'") }
    return ''
}

function New-Slug([string]$Text) {
    $slug = ($Text -replace '[^A-Za-z0-9]+', '-').Trim('-').ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($slug)) { $slug = 'legacy-' + (Get-Date).ToString('yyyyMMddHHmmss') }
    if ($slug.Length -gt 54) { $slug = $slug.Substring(0, 54).Trim('-') }
    return $slug
}

try {
    $tasks = @()
    $tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object {
        $_.TaskName -like ($TaskPrefix + '*') -and $_.TaskName -notlike 'DSH Study Reminder*'
    })

    $usedIds = @{}

    foreach ($task in $tasks) {
        $result.legacyCount += 1
        $taskName = [string]$task.TaskName
        $label = $taskName
        if ($label.StartsWith($TaskPrefix)) { $label = $label.Substring($TaskPrefix.Length) }

        $trigger = $null
        try { if (@($task.Triggers).Count -gt 0) { $trigger = @($task.Triggers)[0] } } catch { }

        $time = ''
        if ($null -ne $trigger) {
            $time = Convert-TriggerTime ([string]$trigger.StartBoundary) $trigger
        }
        if ([string]::IsNullOrWhiteSpace($time)) {
            try {
                $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
                if ($null -ne $info.NextRunTime) { $time = ([datetime]$info.NextRunTime).ToString('HH:mm') }
            } catch { }
        }
        if ([string]::IsNullOrWhiteSpace($time)) {
            $result.errors += [ordered]@{ task = $taskName; message = 'cannot read trigger time' }
            continue
        }

        $days = Convert-TriggerDays $trigger

        $configPath = ''
        try {
            foreach ($action in @($task.Actions)) {
                if ($null -ne $action.Arguments) {
                    $configPath = Get-ConfigPath ([string]$action.Arguments)
                    if (-not [string]::IsNullOrWhiteSpace($configPath)) { break }
                }
            }
        } catch { }

        $title = ''
        $message = ''
        $seconds = 30
        if (-not [string]::IsNullOrWhiteSpace($configPath) -and (Test-Path -LiteralPath $configPath)) {
            try {
                $popup = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($popup.PSObject.Properties.Name -contains 'title') { $title = [string]$popup.title }
                if ($popup.PSObject.Properties.Name -contains 'message') { $message = [string]$popup.message }
                if ($popup.PSObject.Properties.Name -contains 'seconds' -and $popup.seconds) { $seconds = [int]$popup.seconds }
            } catch {
                $result.errors += [ordered]@{ task = $taskName; message = ('cannot read legacy config: ' + $_.Exception.Message) }
            }
        }
        if ([string]::IsNullOrWhiteSpace($title)) { $title = $label }
        if ([string]::IsNullOrWhiteSpace($message)) { $message = $title }

        $id = New-Slug $label
        if ($usedIds.ContainsKey($id)) {
            $suffix = 2
            while ($usedIds.ContainsKey($id + '-' + $suffix)) { $suffix += 1 }
            $id = $id + '-' + $suffix
        }
        $usedIds[$id] = $true

        $result.reminders += [ordered]@{
            id         = $id
            title      = $title
            message    = $message
            time       = $time
            days       = $days
            seconds    = $seconds
            position   = 'bottomright'
            enabled    = $true
            legacyTask = $taskName
        }
    }
} catch {
    $result.ok = $false
    $result.errors += [ordered]@{ task = $null; message = $_.Exception.Message }
}

$result | ConvertTo-Json -Depth 8 -Compress
exit 0
