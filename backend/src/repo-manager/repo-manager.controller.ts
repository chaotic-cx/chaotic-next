import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOAuth2, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { RepoManagerService } from './repo-manager.service';

@ApiTags('repo')
@Controller('repo')
export class RepoManagerController {
  constructor(private repoManager: RepoManagerService) {}

  @ApiBearerAuth()
  @ApiOAuth2([])
  @Get('run')
  @ApiOperation({ summary: 'Trigger a repo manager run.' })
  @ApiOkResponse({ description: 'Repo manager run triggered.' })
  run(): void {
    void this.repoManager.run();
  }

  @ApiBearerAuth()
  @ApiOAuth2([])
  @Get('update-db')
  @ApiOperation({ summary: 'Update Chaotic-AUR database versions.' })
  @ApiOkResponse({ description: 'Chaotic-AUR database update triggered.' })
  updateChaoticVersions(): void {
    void this.repoManager.updateChaoticVersions();
  }

  @ApiBearerAuth()
  @ApiOAuth2([])
  @Get('read-namcap')
  @ApiOperation({ summary: 'Read Namcap analysis.' })
  @ApiOkResponse({ description: 'Namcap analysis read triggered.' })
  readNamcap(): void {
    void this.repoManager.readNamcap();
  }
}
