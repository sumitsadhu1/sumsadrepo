<#
.SYNOPSIS
  AGA Evidence Pack collector — measures the Stage-1/2 config checks that
  Microsoft exposes only through admin PowerShell, never through Graph.

.DESCRIPTION
  Produces evidence-pack.json for import into the Agent Governance Assessment
  app (Settings -> Evidence pack). Read-only: every cmdlet used is a Get-*.

  Sections (each skipped independently if the module/role/license is missing —
  a skipped section simply stays "not collected" in the app, it is never guessed):

    SharePoint  (module Microsoft.Online.SharePoint.PowerShell, SharePoint Admin role)
      AGA-401  Data Access Governance report freshness   Get-SPODataAccessGovernanceInsight  (SAM license)
      AGA-402  Interim oversharing brakes (RCD/RAC)      Get-SPOSite -Limit All
    Purview     (module ExchangeOnlineManagement, Connect-IPPSSession, compliance role)
      AGA-403  Sensitivity labels published              Get-LabelPolicy
      AGA-404  DLP policies active                       Get-DlpCompliancePolicy
      AGA-901  Unified audit enabled                     Get-AdminAuditLogConfig
      AGA-903  Retention covers Teams/Copilot chats      Get-RetentionCompliancePolicy
    Operator-verified (interactive prompts; admin-center surfaces with NO API)
      AGA-409  Site lifecycle management policies        you confirm + name the policy
      AGA-410  Teams three-tier protection reviewed      you confirm + name the evidence

  Operator-verified entries are recorded as such — the app displays the
  provenance on every line of evidence. Answer only what you can see in the
  admin center right now; skip anything you cannot.

.EXAMPLE
  ./collect-evidence.ps1 -SpoAdminUrl https://contoso-admin.sharepoint.com -CollectedBy admin@contoso.com

.NOTES
  Requires PowerShell 5.1+ (7+ recommended). Install modules as needed:
    Install-Module Microsoft.Online.SharePoint.PowerShell
    Install-Module ExchangeOnlineManagement
#>
param(
  [string]$SpoAdminUrl = '',
  [Parameter(Mandatory = $true)][string]$CollectedBy,
  [string]$OutFile = 'evidence-pack.json',
  [switch]$SkipSharePoint,
  [switch]$SkipPurview,
  [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
$values = @{}
$evidence = @{}

function Add-Measure([string]$Path, $Value, [string]$CheckId, [string[]]$Lines) {
  $script:values[$Path] = $Value
  $script:evidence[$CheckId] = @($Lines | Where-Object { $_ })
  Write-Host ("  [{0}] {1} = {2}" -f $CheckId, $Path, $Value) -ForegroundColor Green
}
function Skip-Section([string]$What, [string]$Why) {
  Write-Warning "$What skipped ($Why) - those checks stay 'not collected' in the app."
}

# ---------- SharePoint Online ----------
if (-not $SkipSharePoint -and $SpoAdminUrl) {
  try {
    Import-Module Microsoft.Online.SharePoint.PowerShell -DisableNameChecking
    Connect-SPOService -Url $SpoAdminUrl
    Write-Host "Connected to $SpoAdminUrl" -ForegroundColor Cyan

    # AGA-401 - DAG report freshness. Entities probed individually: not every
    # tenant/license exposes every report entity.
    try {
      $reports = @()
      foreach ($entity in 'PermissionedUsers', 'EveryoneExceptExternalUsersAtSite', 'EveryoneExceptExternalUsersForItems', 'SharingLinks_Anyone', 'SharingLinks_PeopleInYourOrg', 'SensitivityLabelForFiles') {
        try { $reports += @(Get-SPODataAccessGovernanceInsight -ReportEntity $entity) } catch {}
      }
      $dates = foreach ($r in $reports) {
        foreach ($prop in 'ReportEndTime', 'CreationTime', 'CreatedDateTime', 'ReportStartTime') {
          if ($r.PSObject.Properties[$prop] -and $r.$prop) { [datetime]$r.$prop; break }
        }
      }
      if ($dates) {
        $latest = ($dates | Measure-Object -Maximum).Maximum
        $days = [int]((Get-Date) - $latest).TotalDays
        Add-Measure 'sharepoint.dagReportLastRunDays' $days 'AGA-401' @(
          ("{0} DAG report(s) found; most recent {1} ({2} days ago)" -f $reports.Count, $latest.ToString('yyyy-MM-dd'), $days))
      } elseif ($reports.Count -eq 0) {
        # The cmdlet worked but no report has ever been generated: that is a
        # real (failing) measurement, not a gap.
        Add-Measure 'sharepoint.dagReportLastRunDays' 9999 'AGA-401' @(
          'DAG cmdlet reachable but no reports have ever been generated')
      }
    } catch { Skip-Section 'AGA-401 DAG reports' $_.Exception.Message }

    # AGA-402 - interim brakes: count sites with RCD or RAC applied.
    try {
      $sites = Get-SPOSite -Limit All
      $braked = @($sites | Where-Object {
          ($_.PSObject.Properties['RestrictContentOrgWideSearch'] -and $_.RestrictContentOrgWideSearch) -or
          ($_.PSObject.Properties['RestrictedAccessControl'] -and $_.RestrictedAccessControl)
        })
      $lines = @(("{0} of {1} sites have RCD or restricted access control applied" -f $braked.Count, $sites.Count))
      $lines += @($braked | Select-Object -First 5 | ForEach-Object { "Braked site: $($_.Url)" })
      Add-Measure 'sharepoint.interimBrakes' ($braked.Count -gt 0) 'AGA-402' $lines
    } catch { Skip-Section 'AGA-402 RCD/RAC scan' $_.Exception.Message }
  }
  catch { Skip-Section 'SharePoint section' $_.Exception.Message }
}
elseif (-not $SkipSharePoint) {
  Skip-Section 'SharePoint section' 'no -SpoAdminUrl given'
}

# ---------- Purview (Security & Compliance PowerShell) ----------
if (-not $SkipPurview) {
  try {
    Import-Module ExchangeOnlineManagement
    Connect-IPPSSession
    Write-Host 'Connected to Security & Compliance PowerShell' -ForegroundColor Cyan

    try {
      $labelPolicies = @(Get-LabelPolicy | Where-Object { $_.Enabled -ne $false })
      Add-Measure 'purview.sensitivityLabelsPublished' ($labelPolicies.Count -gt 0) 'AGA-403' (
        @(("{0} enabled label publishing polic(ies)" -f $labelPolicies.Count)) +
        @($labelPolicies | Select-Object -First 5 | ForEach-Object { "Label policy: $($_.Name)" }))
    } catch { Skip-Section 'AGA-403 label policies' $_.Exception.Message }

    try {
      $dlp = @(Get-DlpCompliancePolicy | Where-Object { $_.Mode -eq 'Enable' })
      Add-Measure 'purview.dlpPoliciesActive' ($dlp.Count -gt 0) 'AGA-404' (
        @(("{0} DLP polic(ies) in Enable mode" -f $dlp.Count)) +
        @($dlp | Select-Object -First 5 | ForEach-Object { "DLP policy: $($_.Name)" }))
    } catch { Skip-Section 'AGA-404 DLP policies' $_.Exception.Message }

    try {
      $audit = Get-AdminAuditLogConfig
      Add-Measure 'purview.auditCopilotInteractions' ([bool]$audit.UnifiedAuditLogIngestionEnabled) 'AGA-901' @(
        "UnifiedAuditLogIngestionEnabled = $($audit.UnifiedAuditLogIngestionEnabled)",
        'Copilot/agent interactions are recorded automatically while unified auditing is enabled')
    } catch { Skip-Section 'AGA-901 audit config' $_.Exception.Message }

    try {
      $retention = @(Get-RetentionCompliancePolicy | Where-Object { $_.Enabled })
      # Teams chat retention location governs Copilot interactions ("Teams chats
      # and Copilot interactions" in Purview).
      $aiCovered = @($retention | Where-Object {
          ($_.PSObject.Properties['TeamsChatLocation'] -and $_.TeamsChatLocation) -or $_.Name -match 'copilot'
        })
      Add-Measure 'purview.retentionForAiInteractions' ($aiCovered.Count -gt 0) 'AGA-903' (
        @(("{0} enabled retention polic(ies); {1} cover Teams chats / Copilot interactions" -f $retention.Count, $aiCovered.Count)) +
        @($aiCovered | Select-Object -First 5 | ForEach-Object { "Retention policy: $($_.Name)" }))
    } catch { Skip-Section 'AGA-903 retention policies' $_.Exception.Message }
  }
  catch { Skip-Section 'Purview section' $_.Exception.Message }
}

# ---------- Operator-verified (no API surface exists) ----------
if (-not $NonInteractive) {
  Write-Host ''
  Write-Host 'Operator verification - answer only what you can SEE in the admin center now; Enter to skip.' -ForegroundColor Cyan

  $a = Read-Host 'AGA-409: Is at least one site lifecycle policy (inactive-site / ownership / attestation) ACTIVE in SharePoint admin > Site lifecycle management? (y/n/skip)'
  if ($a -match '^[yn]$') {
    $ref = Read-Host '  Policy name(s) you are looking at (required)'
    if ($ref) {
      Add-Measure 'sharepoint.siteLifecycleManagement' ($a -eq 'y') 'AGA-409' @(
        "Operator-verified in SharePoint admin center by $CollectedBy",
        "Referenced policy: $ref")
    } else { Write-Warning 'AGA-409 skipped - a named reference is required for an operator-verified answer.' }
  }

  $a = Read-Host 'AGA-410: Have baseline/sensitive/highly-sensitive Teams protection tiers been applied and external sharing reviewed? (y/n/skip)'
  if ($a -match '^[yn]$') {
    $ref = Read-Host '  What are you referencing (label names / review record)? (required)'
    if ($ref) {
      Add-Measure 'teams.protectionReviewed' ($a -eq 'y') 'AGA-410' @(
        "Operator-verified by $CollectedBy",
        "Reference: $ref")
    } else { Write-Warning 'AGA-410 skipped - a named reference is required for an operator-verified answer.' }
  }
}

# ---------- Write the pack ----------
if ($values.Count -eq 0) {
  Write-Error 'Nothing was collected - no pack written.'
  exit 1
}
$pack = [ordered]@{
  schema      = 'aga-evidence-pack/v1'
  collectedAt = (Get-Date).ToUniversalTime().ToString('o')
  collectedBy = $CollectedBy
  tool        = 'collect-evidence.ps1/0.6.0'
  values      = $values
  evidence    = $evidence
}
$pack | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host ''
Write-Host ("Wrote {0} measurement(s) to {1}" -f $values.Count, $OutFile) -ForegroundColor Green
Write-Host 'Import it in the app: Settings -> Evidence pack -> Import. Packs expire after 30 days.'
