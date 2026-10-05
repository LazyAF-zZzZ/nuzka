# Builds Nuzka's installer window and glues Velopack's Setup.exe behind it.
#
#   .\scripts\build-setup.ps1 -VelopackSetup releases\RovOverlayTool3-win-Setup.exe `
#       -Output releases\Nuzka-win-Setup.exe -Version 3.3.0
#   .\scripts\build-setup.ps1 -PreviewOnly -Version 3.3.0     # just compile, for --preview
#
# The wizard is compiled with the .NET Framework csc that ships with Windows: no SDK, no
# NuGet, and the result is a few hundred KB. See scripts\setup-wizard\Wizard.cs.
[CmdletBinding()]
param(
    [string]$VelopackSetup,
    [string]$Output,
    [Parameter(Mandatory = $true)][string]$Version,
    [switch]$PreviewOnly
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $PSScriptRoot 'setup-wizard\Wizard.cs'
$fw = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$wpf = Join-Path $fw 'WPF'
$work = Join-Path $root 'publish\setup-wizard'
New-Item -ItemType Directory -Path $work -Force | Out-Null

$versionFile = Join-Path $work 'version.txt'
[IO.File]::WriteAllText($versionFile, $Version)
$icon = Join-Path $root 'backend\public\images\app-icon.ico'
$logo = Join-Path $root 'docs\brand\nuzka-icon-small.png'
$wizard = Join-Path $work 'NuzkaSetupWizard.exe'

$refs = @(
    "$wpf\PresentationFramework.dll", "$wpf\PresentationCore.dll", "$wpf\WindowsBase.dll",
    "$fw\System.Xaml.dll", "$fw\System.dll", "$fw\System.Core.dll", "$fw\System.Windows.Forms.dll"
) | ForEach-Object { "/r:$_" }

& (Join-Path $fw 'csc.exe') /nologo /target:winexe /optimize+ "/out:$wizard" "/win32icon:$icon" `
    "/resource:$(Join-Path $root 'LICENSE.md'),license" "/resource:$versionFile,version" "/resource:$icon,icon" "/resource:$logo,logo" `
    "/win32manifest:$(Join-Path $PSScriptRoot 'setup-wizard\wizard.manifest')" @refs $src
if ($LASTEXITCODE -ne 0) { throw 'csc failed' }

if ($PreviewOnly) { Write-Host "  wizard: $wizard"; return }

# [wizard][Velopack Setup.exe][8-byte length][8-byte magic]
$payload = [IO.File]::OpenRead((Resolve-Path $VelopackSetup))
try {
    $out = [IO.File]::Create($Output)
    try {
        $w = [IO.File]::OpenRead($wizard); try { $w.CopyTo($out) } finally { $w.Dispose() }
        $payload.CopyTo($out)
        $out.Write([BitConverter]::GetBytes([int64]$payload.Length), 0, 8)
        $magic = [Text.Encoding]::ASCII.GetBytes('NUZKAPL1')
        $out.Write($magic, 0, 8)
    }
    finally { $out.Dispose() }
}
finally { $payload.Dispose() }
Write-Host "  installer: $Output"
