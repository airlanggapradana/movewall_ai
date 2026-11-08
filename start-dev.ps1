# MoveWall AI - PowerShell Dev Launcher
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   MoveWall AI - Unified Dev Runner (PowerShell)    " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Memulai Backend & Frontend via node run-dev.js..." -ForegroundColor DarkGray
Write-Host "Tekan Ctrl + C untuk menghentikan kedua service secara bersamaan.`n" -ForegroundColor Yellow

node run-dev.js

