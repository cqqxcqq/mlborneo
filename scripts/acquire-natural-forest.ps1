$ErrorActionPreference = 'Stop'
$naturalCache = Join-Path $PSScriptRoot '..\data\raw\natural-forest'
New-Item -ItemType Directory -Path $naturalCache -Force | Out-Null
$recordPath = Join-Path $naturalCache 'acquisition.json'
if (Test-Path -LiteralPath $recordPath) {
  $previous = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  $valid = $true
  foreach ($item in $previous.files) {
    $cached = Join-Path $naturalCache $item.file
    if (!(Test-Path -LiteralPath $cached) -or (Get-FileHash -LiteralPath $cached -Algorithm SHA256).Hash.ToLower() -ne $item.sha256) { $valid = $false; break }
  }
  if ($valid -and $previous.files.Count -eq 8) { Write-Output 'Verified existing natural-forest texture cache. No network needed.'; exit 0 }
}
$treeFiles = Invoke-RestMethod -Uri 'https://api.polyhaven.com/files/island_tree_01' -TimeoutSec 30
$groundFiles = Invoke-RestMethod -Uri 'https://api.polyhaven.com/files/brown_mud_leaves_01' -TimeoutSec 30
$groundColour = ($groundFiles.PSObject.Properties | Where-Object Name -Match '^(diff|diffuse)$' | Select-Object -First 1).Value
$downloads = @(@{name='bark-color';file=$treeFiles.Diffuse.'1k'.png},@{name='bark-normal';file=$treeFiles.nor_gl.'1k'.png},@{name='bark-arm';file=$treeFiles.arm.'1k'.png},@{name='leaf-color';file=$treeFiles.leaves_diff.'1k'.png},@{name='leaf-alpha';file=$treeFiles.leaves_alpha.'1k'.png},@{name='ground-color';file=$groundColour.'1k'.png},@{name='ground-normal';file=$groundFiles.nor_gl.'1k'.png},@{name='ground-arm';file=$groundFiles.arm.'1k'.png})
$records = foreach ($download in $downloads) {
  if (!$download.file.url) { throw "Missing official texture entry: $($download.name)" }
  $destination = Join-Path $naturalCache ($download.name + '.png')
  Invoke-WebRequest -Uri $download.file.url -OutFile $destination -TimeoutSec 60
  if ((Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLower() -ne $download.file.md5) { throw "Download checksum mismatch: $($download.name)" }
  [pscustomobject]@{file=$download.name+'.png';url=$download.file.url;bytes=(Get-Item -LiteralPath $destination).Length;sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLower();acquiredAt=(Get-Date).ToUniversalTime().ToString('o')}
}
[pscustomobject]@{license='CC0-1.0';licenseUrl='https://polyhaven.com/license';assets=@('https://polyhaven.com/a/island_tree_01','https://polyhaven.com/a/brown_mud_leaves_01');files=$records} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $recordPath -Encoding utf8
Write-Output 'Natural forest source textures acquired and verified.'
