# Installs the VaultWatch agent as a startup task on Windows. Run in PowerShell as Administrator.
# VaultWatch -> Integrations gives you this command:
#
#   $env:VAULTWATCH_URL='https://your-site'; $env:VAULTWATCH_API_KEY='vw_live_...'; irm https://your-site/api/v1/agent/install.ps1 | iex
#
# Optional: $env:VAULTWATCH_RACK, $env:VAULTWATCH_DATACENTER, $env:VAULTWATCH_SERVER_ID.
# Remove it again by setting $env:VAULTWATCH_UNINSTALL='1' before the same irm command.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Install-VaultWatchAgent {
    $dir = Join-Path $env:ProgramData 'VaultWatchAgent'
    $task = 'VaultWatch Agent'

    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { throw 'Open PowerShell with "Run as administrator", because this installs a startup task.' }

    if ($env:VAULTWATCH_UNINSTALL) {
        Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
        Write-Host 'VaultWatch agent removed.'
        return
    }

    $url = "$env:VAULTWATCH_URL".TrimEnd('/')
    if (-not $url) { throw 'VAULTWATCH_URL is not set.' }
    if (-not $env:VAULTWATCH_API_KEY) { throw 'VAULTWATCH_API_KEY is not set.' }

    # An empty batch is refused either way, but a bad key gets 401 or 403 before the body is looked at.
    try {
        Invoke-WebRequest -UseBasicParsing -Method Post "$url/api/v1/telemetry/ingest" -Headers @{ 'X-API-Key' = $env:VAULTWATCH_API_KEY } -ContentType 'application/json' -Body '{"points":[]}' | Out-Null
    } catch {
        if (-not $_.Exception.Response) { throw "Could not reach $url." }
        if ([int]$_.Exception.Response.StatusCode -in 401, 403) { throw 'VaultWatch refused this API key. Create a new one in Integrations.' }
    }

    # The Microsoft Store "python" stub prints a message instead of running, so check that it really runs.
    function Find-Python {
        foreach ($candidate in @('py', 'python', 'python3')) {
            try {
                $found = & $candidate -c 'import sys; print(sys.executable) if sys.version_info >= (3, 9) else None' 2>$null
                if ($found -and (Test-Path $found)) { return $found }
            } catch {}
        }
    }
    $python = Find-Python
    if (-not $python) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Install Python 3 from python.org, then run this again.' }
        Write-Host 'Installing Python...'
        winget install --id Python.Python.3.12 --exact --scope machine --silent --accept-source-agreements --accept-package-agreements | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + $env:Path
        $python = Find-Python
        if (-not $python) { throw 'Python was installed but cannot be found yet. Open a new PowerShell window and run this again.' }
    }

    Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $dir | Out-Null
    foreach ($file in @('agent.py', 'requirements.txt')) {
        Invoke-WebRequest -UseBasicParsing "$url/api/v1/agent/$file" -OutFile (Join-Path $dir $file)
    }

    Write-Host 'Installing the agent...'
    & $python -m venv (Join-Path $dir 'venv')
    if ($LASTEXITCODE) { throw 'Could not create the Python environment.' }
    $venvPython = Join-Path $dir 'venv\Scripts\python.exe'
    & $venvPython -m pip install -q --disable-pip-version-check -r (Join-Path $dir 'requirements.txt')
    if ($LASTEXITCODE) { throw "Could not install the agent's Python packages." }

    # Disk failure prediction needs smartctl. The agent works without it.
    $smartctl = Join-Path $env:ProgramFiles 'smartmontools\bin\smartctl.exe'
    if (-not (Test-Path $smartctl) -and (Get-Command winget -ErrorAction SilentlyContinue)) {
        winget install --id smartmontools.smartmontools --exact --silent --accept-source-agreements --accept-package-agreements | Out-Null
    }
    if (-not (Test-Path $smartctl)) { Write-Host 'smartmontools was not installed, so disk failure prediction stays off.' }

    $config = Join-Path $dir 'agent.env'
    @(
        "VAULTWATCH_URL=$url"
        "VAULTWATCH_API_KEY=$env:VAULTWATCH_API_KEY"
        "VAULTWATCH_RACK=$env:VAULTWATCH_RACK"
        "VAULTWATCH_DATACENTER=$env:VAULTWATCH_DATACENTER"
        "VAULTWATCH_SERVER_ID=$env:VAULTWATCH_SERVER_ID"
        "SMARTCTL=$smartctl"
    ) | Set-Content -Encoding ascii $config
    # Only SYSTEM and administrators can read the API key.
    icacls $config /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null

    $action = New-ScheduledTaskAction -Execute $venvPython -Argument "-u `"$(Join-Path $dir 'agent.py')`" --config `"$config`"" -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $task
    Start-Sleep -Seconds 3
    if ((Get-ScheduledTask -TaskName $task).State -ne 'Running') { throw 'The agent did not start. Check the "VaultWatch Agent" task in Task Scheduler.' }

    Write-Host 'VaultWatch agent installed and running. It starts automatically after a restart.'
    Write-Host 'This computer appears on your dashboard within a minute.'
}

try {
    Install-VaultWatchAgent
} catch {
    Write-Host "VaultWatch install failed: $($_.Exception.Message)" -ForegroundColor Red
}
