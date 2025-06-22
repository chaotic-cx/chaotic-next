import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import type { LoginCredentials } from '../types';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local.auth.guard';

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
    Logger.log(`User ${cred.username} is attempting to sign in with password ${cred.password}`, 'AuthController');
    return this.authService.signIn(cred.username, cred.password);
  }

  @HttpCode(HttpStatus.OK)
  @Get('auth0/login')
  @ApiOperation({ summary: 'Initiate Auth0 login flow.' })
  @ApiOkResponse({ description: 'Auth0 login initiated.' })
  auth0Login() {
    Logger.log('User is attempting to sign in with Auth0', 'AuthController');
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
}
