# Assemble la video finale : sous-titres optimises + voix off synchronisee.
# Usage :
#   .\assembler_intro.ps1 -CleanVideo "C:\chemin\intro_clean.mp4"
param(
  [Parameter(Mandatory = $true)][string]$CleanVideo,
  [string]$Srt     = "C:\Users\Micka\Desktop\files\video_projet\intro\sous_titres\intro.srt",
  [string]$VoixDir = "C:\Users\Micka\Desktop\files\video_projet\intro\voix_off",
  [string]$Repliques = "C:\Users\Micka\Desktop\files\video_projet\intro\voix_off\repliques.json",
  [string]$Sortie  = "C:\Users\Micka\Desktop\files\video_projet\intro\sortie\intro_final.mp4",
  [double]$VolumeFond = 0.6   # volume du fond sonore d'origine (1.0 = inchange)
)

$ffDir   = Get-Content "$env:TEMP\ffdir.txt"
$ffmpeg  = Join-Path $ffDir "ffmpeg.exe"

# --- Construire les entrees et le graphe de filtres ---
$data = Get-Content $Repliques -Raw | ConvertFrom-Json
$inputs   = @("-i", "`"$CleanVideo`"")
$idx = 1
$voixLabels = @()
foreach ($l in $data.lignes) {
  $mp3 = Join-Path $VoixDir ("ligne_{0:D2}.mp3" -f $l.id)
  if (-not (Test-Path $mp3)) { Write-Error "Manque : $mp3"; exit 1 }
  $inputs += @("-i", "`"$mp3`"")
  $delayMs = [int]([double]$l.start * 1000)
  $voixLabels += "[a$idx]"
  $idx++
}

# Filtres audio : retarder chaque voix, puis mixer avec le fond
$delayFilters = @()
$idx = 1
foreach ($l in $data.lignes) {
  $delayMs = [int]([double]$l.start * 1000)
  $delayFilters += "[$idx`:a]adelay=$delayMs`|$delayMs[a$idx]"
  $idx++
}
$nbVoix = $data.lignes.Count
$amix = "[0:a]volume=$VolumeFond[fond];[fond]" + ($voixLabels -join "") + "amix=inputs=$($nbVoix+1):duration=first:normalize=0[aout]"

# Filtre video : incruster les sous-titres (chemin echappe pour le filtre)
$srtEsc = $Srt -replace '\\','/' -replace ':','\:'
$style = "FontName=Arial,Fontsize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=140"
$vfilter = "subtitles='$srtEsc':force_style='$style'[vout]"

$filterComplex = ($delayFilters -join ";") + ";" + $amix + ";" + $vfilter

$args = @("-y") + $inputs + @(
  "-filter_complex", $filterComplex,
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-c:a", "aac", "-b:a", "192k",
  "-pix_fmt", "yuv420p",
  "`"$Sortie`""
)

Write-Host "Assemblage en cours..." -ForegroundColor Cyan
& $ffmpeg @args
if ($LASTEXITCODE -eq 0) {
  Write-Host "`nTermine : $Sortie" -ForegroundColor Green
} else {
  Write-Host "`nEchec FFmpeg (code $LASTEXITCODE)" -ForegroundColor Red
}
