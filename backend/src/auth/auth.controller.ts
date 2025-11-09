import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LoginCredentials } from '../types';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local.auth.guard';
import { AllowAnonymous } from './anonymous.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Authenticate user and return JWT or session.' })
  @ApiBody({ type: Object, description: 'User login credentials' })
  @ApiOkResponse({ description: 'User authenticated successfully.' })
  @UseGuards(LocalAuthGuard)
  signIn(@Body() cred: LoginCredentials) {
    return this.authService.signIn(cred.username, cred.password);
  }

  @HttpCode(HttpStatus.OK)
  @Get('auth0/callback')
  @ApiOperation({ summary: 'Handle Auth0 login callback.' })
  @ApiOkResponse({ description: 'Auth0 login callback handled.' })
  auth0Callback(req: any) {
    Logger.debug('Auth0 callback initiated', 'AuthController');
    req.session.user_id = req.user.id;
    Logger.debug(`User ${req.user.username} has signed in with Auth0`, 'AuthController');
    Logger.debug(req, 'AuthController');
  }

  @HttpCode(HttpStatus.CREATED)
  @AllowAnonymous()
  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to push events' })
  @ApiBody({ type: Object, description: 'Subscription details' })
  @ApiOkResponse({ description: 'Subscription successful.' })
  async subscribeToPushEvents(@Body() body: PushSubscription) {
    Logger.debug('Subscribing to push events', 'AuthController');
    Logger.log(body, 'AuthController');

    return this.authService.subscribeToPushEvents(body);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for push notifications.' })
  @ApiOkResponse({ description: 'VAPID public key retrieved successfully.' })
  getVapidPublicKey() {
    Logger.debug('Fetching VAPID public key', 'AuthController');
    return {
      vapidPublicKey: this.authService.vapidPublicKey,
    };
  }
}
