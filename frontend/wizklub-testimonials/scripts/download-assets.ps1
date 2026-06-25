$assetsDir = Join-Path $PSScriptRoot "..\public\assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$assets = @{
  "school-campus.png" = "https://www.figma.com/api/mcp/asset/992c60e3-bb5e-4ad5-89b6-d5ca7cbd721a"
  "university-library.png" = "https://www.figma.com/api/mcp/asset/38eeee0b-d609-49f3-97da-306c52e80216"
  "elementary-hallway.png" = "https://www.figma.com/api/mcp/asset/6fec4545-56db-417f-8668-8d42671ab397"
  "student-1.png" = "https://www.figma.com/api/mcp/asset/47d41df3-7441-4d60-9ad3-461c12671892"
  "student-2.png" = "https://www.figma.com/api/mcp/asset/96e0acdf-86d7-4ffd-8993-0b52fa57b28f"
  "student-3.png" = "https://www.figma.com/api/mcp/asset/7024f2c6-cb16-4e6b-9c56-40a7009f2db4"
  "student-4.png" = "https://www.figma.com/api/mcp/asset/c89a4977-5639-4c1f-b7e6-248d489ce661"
  "student-5.png" = "https://www.figma.com/api/mcp/asset/a5e9f64a-76e4-45fb-ad7b-070f02916fb7"
  "student-benjamin.png" = "https://www.figma.com/api/mcp/asset/7326a628-6717-4956-a982-1faaf12dae0b"
  "media-video.png" = "https://www.figma.com/api/mcp/asset/e63ab82f-d407-4baf-bb39-7819f8498ae9"
  "media-ptm.png" = "https://www.figma.com/api/mcp/asset/c019437f-0f0c-4bd5-94ec-fc8773adf53a"
  "media-principal.png" = "https://www.figma.com/api/mcp/asset/2fc07bb4-ac6c-4bed-afd9-38b6366d6f6f"
  "media-parent.png" = "https://www.figma.com/api/mcp/asset/bdf936bf-8756-4d45-aff2-823a9db0f489"
  "media-general.png" = "https://www.figma.com/api/mcp/asset/52c7742b-8dc6-4fc1-ac4e-284c557bf65b"
}

foreach ($entry in $assets.GetEnumerator()) {
  $out = Join-Path $assetsDir $entry.Key
  Write-Host "Downloading $($entry.Key)..."
  Invoke-WebRequest -Uri $entry.Value -OutFile $out
}

Write-Host "Done."
