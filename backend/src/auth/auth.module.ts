import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '../config/auth.config';
import { User } from '../users/users.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  controllers: [AuthController],
  exports: [TypeOrmModule, PassportModule, JwtStrategy, AuthService],
  imports: [
    ConfigModule.forFeature(authConfig),
    JwtModule.register({
      global: true,
      secret: process.env.CAUR_JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
    PassportModule.register({ defaultStrategy: ['jwt', 'local'] }),
    TypeOrmModule.forFeature([User]),
    UsersModule,
  ],
  providers: [AuthService, JwtStrategy, JwtService, LocalStrategy, { provide: APP_GUARD, useClass: JwtGuard }],
})
export class AuthModule {}
