import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { PushSubscription, sendNotification, setVapidDetails } from 'web-push';
import { compare } from 'bcrypt';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { AES, enc } from 'crypto-js';
import { existsSync } from 'node:fs';
import { NotificationPayload } from '@./shared-lib';

@Injectable()
export class AuthService {
  vapidPublicKey: string;
  vapidPrivateKey: string;

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {
    this.vapidPublicKey = this.configService.getOrThrow<string>('CAUR_VAPID_PUBLIC');
    this.vapidPrivateKey = this.configService.getOrThrow<string>('CAUR_VAPID_PRIVATE');
    setVapidDetails('mailto:root@chaotic.cx', this.vapidPublicKey, this.vapidPrivateKey);
  }

  /**
   * Sign in a user, a source of truth is the database.
   * Will throw an error if the user doesn't exist or the password is incorrect.
   * @param username User's username
   * @param password User's password
   * @returns Object containing access_token
   */
  async signIn(username: string, password: string): Promise<{ access_token: string }> {
    const user: User = await this.usersService.checkIfUserExists(username, 'username');

    if (!user) throw new UnauthorizedException("User doesn't exist");

    if (user?.password) {
      const isMatch: boolean = await compare(password, user.password);
      if (!isMatch) throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.name };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  /**
   * Subscribe to push events by saving the subscription details.
   * @param body Push subscription details
   * @returns Success message
   */
  async subscribeToPushEvents(body: PushSubscription) {
    let notificationsJson: PushSubscription[];
    if (existsSync('config/notification-subscriber.json')) {
      const subscriber = await readFile('config/notification-subscriber.json', 'utf-8');
      const decryptedSubscriber = AES.decrypt(
        subscriber,
        this.configService.getOrThrow<string>('CAUR_DB_KEY'),
      ).toString(enc.Utf8);
      notificationsJson = JSON.parse(decryptedSubscriber);
    } else {
      await mkdir('config', { recursive: true });
      notificationsJson = [];
    }
    notificationsJson.push(body);

    // Send welcome notification
    const notification: NotificationPayload = {
      notification: {
        title: 'Subscription successful',
        body: 'You have successfully subscribed to Chaotic AUR notifications.',
        icon: '/android-chrome-512x512.png',
        data: {
          onActionClick: {
            default: {
              operation: 'openWindow',
              url: 'https://chaotic.cx',
            },
          },
        },
      },
    };
    await sendNotification(body, JSON.stringify(notification));

    const encryptedData = AES.encrypt(
      JSON.stringify(notificationsJson),
      this.configService.getOrThrow<string>('CAUR_DB_KEY'),
    ).toString();
    await writeFile('config/notification-subscriber.json', encryptedData);
    return { message: 'Subscription successful' };
  }
}
