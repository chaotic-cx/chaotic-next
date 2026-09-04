import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { Build, Package } from '../builder/builder.entity';
import { BuildStatus } from '../types/types';
import { IssueTrackerService } from './issue-tracker.service';

/** Closes open `[Request]` issues when the requested package lands in the repository. */
@Injectable()
export class NewPackageSubscriber implements EntitySubscriberInterface<Package> {
  constructor(
    dataSource: DataSource,
    private readonly issueTracker: IssueTrackerService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo(): typeof Package {
    return Package;
  }

  async afterInsert(event: InsertEvent<Package>): Promise<void> {
    const pkg = event.entity;
    if (!pkg?.isActive || !pkg.version) return;
    const pkgbase = pkg.pkgbaseName ?? pkg.pkgname;
    if (!pkgbase) return;
    await this.issueTracker.closeFulfilledNewRequest(pkgbase).catch(() => undefined);
  }

  async afterUpdate(event: UpdateEvent<Package>): Promise<void> {
    const partial = event.entity as Package | undefined;
    const previous = event.databaseEntity as Package | undefined;
    const version = partial?.version ?? previous?.version;
    const isActive = partial?.isActive ?? previous?.isActive ?? true;
    if (!isActive || !version) return;
    const pkgbase = partial?.pkgbaseName ?? partial?.pkgname ?? previous?.pkgbaseName ?? previous?.pkgname;
    if (!pkgbase) return;
    await this.issueTracker.closeFulfilledNewRequest(pkgbase).catch(() => undefined);
  }
}

/** Closes open `[Rebuild]` issues when a successful build of the package flows. */
@Injectable()
export class SuccessfulBuildSubscriber implements EntitySubscriberInterface<Build> {
  constructor(
    dataSource: DataSource,
    private readonly issueTracker: IssueTrackerService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo(): typeof Build {
    return Build;
  }

  async afterInsert(event: InsertEvent<Build>): Promise<void> {
    if (event.entity?.status !== BuildStatus.SUCCESS) return;
    const pkgbase = event.entity.pkgbase?.pkgbaseName ?? event.entity.pkgbase?.pkgname;
    if (!pkgbase) return;
    await this.issueTracker.closeFulfilledRebuild(pkgbase).catch(() => undefined);
  }
}
