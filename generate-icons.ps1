Add-Type -AssemblyName System.Drawing

$colors = @{
    background = [System.Drawing.Color]::FromArgb(37, 99, 235)
    foreground = [System.Drawing.Color]::White
}

$sizes = @(192, 512)
$scriptDir = Split-Path -Parent $PSCommandPath

foreach ($size in $sizes) {
    $file = "icon-$size.png"
    $path = Join-Path -Path $scriptDir -ChildPath "icons\$file"

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $brush = New-Object System.Drawing.SolidBrush($colors.background)
    $g.FillRectangle($brush, 0, 0, $size, $size)

    $fontSize = [int]($size * 0.5)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
    $brush2 = New-Object System.Drawing.SolidBrush($colors.foreground)
    $text = "$"

    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString($text, $font, $brush2, $rect, $format)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "Generated: icons\$file ($($size)x$($size))"
}

Write-Host "Done! Icons created in 'icons' folder."
