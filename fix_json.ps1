$content = Get-Content "Bulk Fetch - Jan 15 to Now.json" -Raw
$data = $content | ConvertFrom-Json
$data | ConvertTo-Json -Depth 100 | Set-Content "Bulk Fetch - Jan 15 to Now.json"
