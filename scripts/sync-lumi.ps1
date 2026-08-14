$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$lumiRoot = Join-Path $repoRoot 'nuevas-librerias-h5p'

$questionSrc = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$questionDst = Join-Path $lumiRoot 'H5P.QuestionCFRD-1.0'

function Reset-Directory {
    param([string]$Path)

    if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force
    }

    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-IfExists {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (-not (Test-Path $Source)) {
        Write-Warning "Missing source file: $Source"
        return
    }

    $destDir = Split-Path $Destination -Parent

    if ($destDir -and -not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    Copy-Item -Path $Source -Destination $Destination -Force
}

function Copy-DirectoryContents {
    param(
        [string]$SourceDir,
        [string]$DestinationDir,
        [string[]]$ExcludeExtensions = @()
    )

    if (-not (Test-Path $SourceDir)) {
        Write-Warning "Missing source directory: $SourceDir"
        return
    }

    Get-ChildItem -Path $SourceDir -Recurse -File | ForEach-Object {
        $ext = $_.Extension.ToLowerInvariant()
        if ($ExcludeExtensions -contains $ext) {
            return
        }

        $relativePath = $_.FullName.Substring($SourceDir.Length).TrimStart('\')
        $targetPath = Join-Path $DestinationDir $relativePath
        Copy-IfExists $_.FullName $targetPath
    }
}

Write-Host "Syncing QuestionCFRD -> $questionDst"
Reset-Directory $questionDst

Copy-IfExists (Join-Path $questionSrc 'library.json') (Join-Path $questionDst 'library.json')
# Exclude .ps1 so sync-lumi.ps1 is not packaged into the H5P library (breaks Lumi).
Copy-DirectoryContents (Join-Path $questionSrc 'scripts') (Join-Path $questionDst 'scripts') -ExcludeExtensions @('.ps1')
Copy-DirectoryContents (Join-Path $questionSrc 'styles') (Join-Path $questionDst 'styles')
Copy-DirectoryContents (Join-Path $questionSrc 'images') (Join-Path $questionDst 'images')

$appDataLibs = Join-Path $env:APPDATA 'lumi\libraries'
$questionAppData = Join-Path $appDataLibs 'H5P.QuestionCFRD-1.0'
if (Test-Path $appDataLibs) {
    Write-Host "Syncing QuestionCFRD -> $questionAppData"
    Reset-Directory $questionAppData
    Copy-IfExists (Join-Path $questionDst 'library.json') (Join-Path $questionAppData 'library.json')
    Copy-DirectoryContents (Join-Path $questionDst 'scripts') (Join-Path $questionAppData 'scripts') -ExcludeExtensions @('.ps1')
    Copy-DirectoryContents (Join-Path $questionDst 'styles') (Join-Path $questionAppData 'styles')
    if (Test-Path (Join-Path $questionDst 'images')) {
        Copy-DirectoryContents (Join-Path $questionDst 'images') (Join-Path $questionAppData 'images')
    }
}
else {
    Write-Warning "Lumi AppData libraries folder not found; skipped AppData QuestionCFRD sync."
}

Write-Host "Done."
