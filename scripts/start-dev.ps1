# MoveWall AI - PowerShell Dev Launcher
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   MoveWall AI - Unified Dev Runner (PowerShell)    " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Memulai Backend & Frontend via node scripts/run-dev.js..." -ForegroundColor DarkGray
Write-Host "Tekan Ctrl + C untuk menghentikan kedua service secara bersamaan.`n" -ForegroundColor Yellow

node (Join-Path $RootDir "scripts\run-dev.js")

