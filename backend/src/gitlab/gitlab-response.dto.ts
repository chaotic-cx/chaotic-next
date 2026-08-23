import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class ExternalCommitStatusDto {
  @ApiProperty({ description: 'Status check ID' }) @IsNumber() id!: number;
  @ApiProperty({ description: 'Status check name (e.g. "ci/test")' }) @IsString() name!: string;
  @ApiProperty({ description: 'Current status (pending, running, success, failed)' }) @IsString() status!: string;
  @ApiProperty({ description: 'Human-readable status description', nullable: true })
  @IsOptional()
  @IsString()
  description!: string | null;
  @ApiProperty({ description: 'URL linking to the external status check details', nullable: true })
  @IsOptional()
  @IsString()
  target_url!: string | null;
  @ApiProperty({ description: 'ISO 8601 timestamp when the check started', nullable: true })
  @IsOptional()
  @IsString()
  started_at!: string | null;
  @ApiProperty({ description: 'ISO 8601 timestamp when the check finished', nullable: true })
  @IsOptional()
  @IsString()
  finished_at!: string | null;
  @ApiProperty({ description: 'GitLab pipeline ID this status belongs to' }) @IsNumber() pipeline_id!: number;
}

export class GitlabJobDto {
  @ApiProperty({ description: 'GitLab job ID' }) @IsNumber() id!: number;
  @ApiProperty({ description: 'Job name as defined in .gitlab-ci.yml' }) @IsString() name!: string;
  @ApiProperty({ description: 'Pipeline stage the job belongs to' }) @IsString() stage!: string;
  @ApiProperty({ description: 'Job status (pending, running, success, failed, etc.)' }) @IsString() status!: string;
  @ApiProperty({ description: 'Git ref the job was triggered on' }) @IsString() ref!: string;
  @ApiProperty({ description: 'URL to the job page in GitLab' }) @IsString() webUrl!: string;
  @ApiPropertyOptional({ description: 'ISO 8601 timestamp when the job started' })
  @IsOptional()
  @IsString()
  startedAt?: string;
  @ApiPropertyOptional({ description: 'ISO 8601 timestamp when the job finished' })
  @IsOptional()
  @IsString()
  finishedAt?: string;
  @ApiPropertyOptional({ description: 'Job duration in seconds' }) @IsOptional() @IsNumber() duration?: number;
}

export class PipelineTriggerResultDto {
  @ApiProperty({ description: 'GitLab pipeline ID' }) @IsNumber() pipelineId!: number;
  @ApiProperty({ description: 'URL to the pipeline page in GitLab' }) @IsString() webUrl!: string;
  @ApiProperty({ description: 'Initial pipeline status' }) @IsString() status!: string;
}

export class PipelineScheduleOptionDto {
  @ApiProperty({ description: 'Pipeline schedule ID' }) @IsNumber() id!: number;
  @ApiProperty({ description: 'Schedule description', nullable: true }) @IsOptional() @IsString() description!:
    string | null;
  @ApiProperty({ description: 'Whether the schedule is active' }) @IsBoolean() active!: boolean;
}

export class DiffScanFindingDto {
  @ApiProperty({ description: 'Rule identifier (e.g. "REDIRECT臼-1")' }) @IsString() ruleId!: string;
  @ApiProperty({ description: 'Human-readable rule name' }) @IsString() ruleName!: string;
  @ApiProperty({ description: 'Finding severity', enum: ['critical', 'warning', 'info'] })
  @IsString()
  severity!: string;
  @ApiProperty({ description: 'Detailed description of the finding' }) @IsString() description!: string;
  @ApiProperty({ description: 'Source file path where the finding was detected' }) @IsString() file!: string;
  @ApiPropertyOptional({ description: 'Line number in the source file' }) @IsOptional() @IsNumber() line?: number;
  @ApiProperty({ description: 'Matched content or pattern' }) @IsString() match!: string;
}

export class VtEngineStatsDto {
  @ApiProperty({ description: 'Number of engines flagging as malicious' }) @IsNumber() malicious!: number;
  @ApiProperty({ description: 'Number of engines flagging as suspicious' }) @IsNumber() suspicious!: number;
  @ApiProperty({ description: 'Number of engines with no detection' }) @IsNumber() undetected!: number;
  @ApiProperty({ description: 'Number of engines flagging as harmless' }) @IsNumber() harmless!: number;
  @ApiProperty({ description: 'Number of engines that timed out' }) @IsNumber() timeout!: number;
}

export class VtIndicatorReportDto {
  @ApiProperty({ description: 'Indicator type', enum: ['url', 'file'] }) @IsString() type!: string;
  @ApiProperty({ description: 'The URL or file hash being analysed' }) @IsString() value!: string;
  @ApiProperty({ description: 'Contextual note about this indicator' }) @IsString() context!: string;
  @ApiProperty({ description: 'VirusTotal verdict', enum: ['malicious', 'suspicious', 'clean', 'unknown'] })
  @IsString()
  verdict!: string;
  @ApiPropertyOptional({ description: 'Per-engine detection statistics', type: VtEngineStatsDto })
  @IsOptional()
  @Type(() => VtEngineStatsDto)
  stats?: VtEngineStatsDto;
}

export class AurMaintainerInfoDto {
  @ApiProperty({ description: 'AUR username' }) @IsString() username!: string;
  @ApiProperty({ description: 'Number of packages maintained by this user' }) @IsNumber() packagesMaintained!: number;
  @ApiProperty({ description: 'Total votes across all maintained packages' }) @IsNumber() totalVotes!: number;
  @ApiProperty({ description: "Submission date of the maintainer's oldest package (ISO 8601)" })
  @IsString()
  oldestFirstSubmitted!: string;
  @ApiProperty({ description: 'Whether the account is flagged as novice' }) @IsBoolean() novice!: boolean;
}

export class AurMaintainerChangeDto {
  @ApiProperty({ description: 'Previously known maintainers', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  previous!: string[];
  @ApiProperty({ description: 'Newly added maintainers', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  added!: string[];
  @ApiProperty({ description: 'Maintainers that were removed', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  removed!: string[];
  @ApiProperty({ description: 'ISO 8601 timestamp when the change was detected' }) @IsString() detectedAt!: string;
}

export class AurPackageMetaDto {
  @ApiProperty({ description: 'Number of AUR votes' }) @IsNumber() votes!: number;
  @ApiProperty({ description: 'AUR popularity score' }) @IsNumber() popularity!: number;
  @ApiProperty({ description: 'ISO 8601 date when the package was first submitted to AUR' })
  @IsString()
  firstSubmitted!: string;
  @ApiProperty({ description: 'Whether the package is out-of-date' }) @IsBoolean() outOfDate!: boolean;
  @ApiProperty({ description: 'Whether the package is orphaned' }) @IsBoolean() orphaned!: boolean;
}

export class AurPackageScanDto {
  @ApiProperty({ description: 'AUR package name' }) @IsString() packageName!: string;
  @ApiProperty({ description: 'AUR package base name' }) @IsString() packageBase!: string;
  @ApiProperty({ description: 'Current scan status', enum: ['scanning', 'awaiting-vt', 'done', 'failed'] })
  @IsString()
  status!: string;
  @ApiPropertyOptional({ description: 'Error message if the scan failed' }) @IsOptional() @IsString() error?: string;
  @ApiProperty({ description: 'PKGBUILD source URLs', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  sources!: string[];
  @ApiProperty({ description: 'List of scanned file paths', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  scannedFiles!: string[];
  @ApiProperty({
    description: 'Static analysis findings from diff-scan rules',
    type: DiffScanFindingDto,
    isArray: true,
  })
  @IsArray()
  @Type(() => DiffScanFindingDto)
  findings!: DiffScanFindingDto[];
  @ApiProperty({ description: 'VirusTotal indicator reports', type: VtIndicatorReportDto, isArray: true })
  @IsArray()
  @Type(() => VtIndicatorReportDto)
  vtReports!: VtIndicatorReportDto[];
  @ApiProperty({ description: 'Number of pending VirusTotal lookups' }) @IsNumber() vtPending!: number;
  @ApiProperty({ description: 'AUR maintainer information', type: AurMaintainerInfoDto, isArray: true })
  @IsArray()
  @Type(() => AurMaintainerInfoDto)
  maintainers!: AurMaintainerInfoDto[];
  @ApiPropertyOptional({ description: 'Maintainer change detected during this scan', type: AurMaintainerChangeDto })
  @IsOptional()
  @Type(() => AurMaintainerChangeDto)
  maintainerChange?: AurMaintainerChangeDto;
  @ApiProperty({ description: 'AUR package metadata', type: AurPackageMetaDto })
  @Type(() => AurPackageMetaDto)
  @Allow()
  packageMeta!: AurPackageMetaDto;
  @ApiPropertyOptional({ description: 'Raw PKGBUILD source files (when requested)', type: Object, isArray: true })
  @IsOptional()
  @IsArray()
  sourceFiles?: { name: string; content: string }[];
  @ApiPropertyOptional({
    description: 'Repo files detected as binary and therefore not shipped',
    type: String,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  skippedBinaryFiles?: string[];
  @ApiProperty({ description: 'ISO 8601 timestamp when the scan started' }) @IsString() startedAt!: string;
}

export class MergeRequestDiffDto {
  @ApiProperty({ description: 'Original file path' }) @IsString() old_path!: string;
  @ApiProperty({ description: 'New file path' }) @IsString() new_path!: string;
  @ApiProperty({ description: 'File mode of the old version' }) @IsString() a_mode!: string;
  @ApiProperty({ description: 'File mode of the new version' }) @IsString() b_mode!: string;
  @ApiProperty({ description: 'Whether this is a new file' }) @IsBoolean() new_file!: boolean;
  @ApiProperty({ description: 'Whether the file was renamed' }) @IsBoolean() renamed_file!: boolean;
  @ApiProperty({ description: 'Whether the file was deleted' }) @IsBoolean() deleted_file!: boolean;
  @ApiProperty({ description: 'Unified diff content' }) @IsString() diff!: string;
}

export class SimpleUserDto {
  @ApiProperty({ description: 'GitLab user ID' }) @IsNumber() id!: number;
  @ApiProperty({ description: 'GitLab username' }) @IsString() username!: string;
  @ApiProperty({ description: 'Display name' }) @IsString() name!: string;
  @ApiProperty({ description: 'Avatar image URL' }) @IsString() avatar_url!: string;
  @ApiProperty({ description: 'Profile page URL' }) @IsString() web_url!: string;
  @ApiProperty({ description: 'Account state (active, blocked, etc.)' }) @IsString() state!: string;
}

export class MergeRequestWithDiffsDto {
  @ApiProperty({ description: 'GitLab merge request ID' }) @IsNumber() id!: number;
  @ApiProperty({ description: 'Merge request internal ID within the project' }) @IsNumber() iid!: number;
  @ApiProperty({ description: 'Merge request title' }) @IsString() title!: string;
  @ApiProperty({ description: 'Merge request state (opened, closed, merged)' }) @IsString() state!: string;
  @ApiProperty({ description: 'URL to the merge request in GitLab' }) @IsString() web_url!: string;
  @ApiProperty({ description: 'ISO 8601 creation timestamp' }) @IsString() created_at!: string;
  @ApiProperty({ description: 'ISO 8601 last-updated timestamp' }) @IsString() updated_at!: string;
  @ApiProperty({ description: 'Assigned users', type: SimpleUserDto, nullable: true })
  @IsOptional()
  @IsArray()
  @Type(() => SimpleUserDto)
  assignees!: SimpleUserDto[] | null;
  @ApiProperty({ description: 'HEAD commit SHA' }) @IsString() sha!: string;
  @ApiProperty({
    description: 'Overall merge status',
    enum: ['unchecked', 'checking', 'can_be_merged', 'cannot_be_merged', 'cannot_be_merged_recheck'],
  })
  @IsString()
  merge_status!: string;
  @ApiProperty({
    description: 'Detailed merge status',
    enum: [
      'blocked_status',
      'broken_status',
      'checking',
      'unchecked',
      'ci_must_pass',
      'ci_still_running',
      'discussions_not_resolved',
      'draft_status',
      'external_status_checks',
      'mergeable',
      'not_approved',
      'not_open',
      'policies_denied',
      'jira_association_missing',
    ],
  })
  @IsString()
  detailed_merge_status!: string;
  @ApiProperty({ description: 'File diffs in this merge request', type: MergeRequestDiffDto, isArray: true })
  @IsArray()
  @Type(() => MergeRequestDiffDto)
  diffs!: MergeRequestDiffDto[];
  @ApiProperty({ description: 'MR labels', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  labels!: string[];
  @ApiPropertyOptional({
    description: 'Static analysis findings from the diff scan',
    type: DiffScanFindingDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @Type(() => DiffScanFindingDto)
  scanFindings?: DiffScanFindingDto[];
  @ApiPropertyOptional({ description: 'VirusTotal indicator reports', type: VtIndicatorReportDto, isArray: true })
  @IsOptional()
  @IsArray()
  @Type(() => VtIndicatorReportDto)
  vtReports?: VtIndicatorReportDto[];
  @ApiPropertyOptional({ description: 'AUR maintainer information', type: AurMaintainerInfoDto, isArray: true })
  @IsOptional()
  @IsArray()
  @Type(() => AurMaintainerInfoDto)
  maintainers?: AurMaintainerInfoDto[];
  @ApiPropertyOptional({ description: 'Maintainer change detected during scan', type: AurMaintainerChangeDto })
  @IsOptional()
  @Type(() => AurMaintainerChangeDto)
  maintainerChange?: AurMaintainerChangeDto;
  @ApiPropertyOptional({ description: 'Package metadata extracted from PKGBUILD', type: Object })
  @IsOptional()
  @Allow()
  packageInfo?: object;
  @ApiPropertyOptional({ description: 'Diff reference SHAs for base, head, and start', type: Object, nullable: true })
  @IsOptional()
  @Allow()
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string } | null;
}

export class PipelineDto {
  @ApiProperty({ description: 'GitLab pipeline ID' }) @IsNumber() id!: number;
  @ApiProperty({ description: 'Pipeline internal ID' }) @IsNumber() iid!: number;
  @ApiProperty({ description: 'GitLab project ID' }) @IsNumber() project_id!: number;
  @ApiProperty({ description: 'Pipeline commit SHA' }) @IsString() sha!: string;
  @ApiProperty({ description: 'Git ref the pipeline runs on' }) @IsString() ref!: string;
  @ApiProperty({ description: 'Pipeline status (pending, running, success, failed, etc.)' })
  @IsString()
  status!: string;
  @ApiProperty({ description: 'URL to the pipeline page in GitLab' }) @IsString() web_url!: string;
  @ApiProperty({ description: 'ISO 8601 creation timestamp' }) @IsString() created_at!: string;
  @ApiProperty({ description: 'ISO 8601 last-updated timestamp' }) @IsString() updated_at!: string;
}

export class PipelineWithExternalStatusDto {
  @ApiProperty({ description: 'External commit status checks', type: ExternalCommitStatusDto, isArray: true })
  @IsArray()
  @Type(() => ExternalCommitStatusDto)
  commit!: ExternalCommitStatusDto[];
  @ApiProperty({ description: 'GitLab pipeline information', type: PipelineDto })
  @Type(() => PipelineDto)
  @Allow()
  pipeline!: PipelineDto;
}

export class ReviewStatsDto {
  @ApiProperty({ description: 'GitLab username' }) @IsString() username!: string;
  @ApiProperty({ description: 'Number of merge request reviews' }) @IsNumber() reviews!: number;
}

export class ReviewStatsOverTimeDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' }) @IsString() date!: string;
  @ApiProperty({ description: 'GitLab username' }) @IsString() username!: string;
  @ApiProperty({ description: 'Number of reviews on this date' }) @IsNumber() reviews!: number;
}
