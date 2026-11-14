import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from './auth.decorators.js';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body({ schema: registerSchema }) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) body: LoginInput) {
    return this.auth.login(body);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
