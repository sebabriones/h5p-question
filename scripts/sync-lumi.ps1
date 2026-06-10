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
        [string]$DestinationDir
    )

    if (-not (Test-Path $SourceDir)) {
        Write-Warning "Missing source directory: $SourceDir"
        return
    }

    Get-ChildItem -Path $SourceDir -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($SourceDir.Length).TrimStart('\')
        $targetPath = Join-Path $DestinationDir $relativePath
        Copy-IfExists $_.FullName $targetPath
    }
}

Write-Host "Syncing QuestionCFRD -> $questionDst"
Reset-Directory $questionDst

Copy-IfExists (Join-Path $questionSrc 'library.json') (Join-Path $questionDst 'library.json')
Copy-DirectoryContents (Join-Path $questionSrc 'scripts') (Join-Path $questionDst 'scripts')
Copy-DirectoryContents (Join-Path $questionSrc 'styles') (Join-Path $questionDst 'styles')
Copy-DirectoryContents (Join-Path $questionSrc 'images') (Join-Path $questionDst 'images')

Write-Host "Done."
