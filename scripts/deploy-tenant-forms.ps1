param([Parameter(Mandatory=$true)][string]$ReleaseDirectory)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$release = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$configFile = Join-Path $release 'vercel.json'
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
$project = Get-Content -LiteralPath (Join-Path $release '.vercel/project.json') -Raw | ConvertFrom-Json
if ($project.projectName -ne 'tenants-subdomain') { throw 'This release is not linked to the tenant forms project.' }
if ($null -ne $config.buildCommand -or $null -ne $config.installCommand -or $null -ne $config.outputDirectory) { throw 'Tenant forms must deploy as static files, without CRM build settings.' }
foreach ($source in @('/onboarding/:token','/:applicationSlug','/agreement/:token')) {
    $expected = if ($source -eq '/agreement/:token') { '/agreement.html' } else { '/application.html' }
    if (-not ($config.rewrites | Where-Object { $_.source -eq $source -and $_.destination -eq $expected })) { throw "Missing public form route: $source" }
}
$cli = Join-Path $repository 'tmp/deploy-tools/vercel/node_modules/vercel/dist/index.js'
Push-Location -LiteralPath $release
try {
    # Pin both working directory and config. --cwd alone can pick up repository CRM routing.
    & node $cli deploy --prod --yes --scope danyls-projects-1551df91 --local-config $configFile
    if ($LASTEXITCODE -ne 0) { throw 'Deployment failed.' }
    & node (Join-Path $PSScriptRoot 'verify-tenant-routes.cjs') $release
    if ($LASTEXITCODE -ne 0) { throw 'Published application route verification failed.' }
} finally { Pop-Location }
