# AWS Cognito Implementation Guide for NestJS

## Overview

This guide provides step-by-step instructions for implementing AWS Cognito authentication with Google OAuth in the baby-steps-nest.js application.

## Prerequisites

- AWS Account with appropriate permissions
- Google Cloud Platform account for OAuth credentials
- Node.js 18+ and npm installed
- AWS CLI configured (optional but recommended)

## Part 1: AWS Cognito Setup

### Step 1: Create Cognito User Pool

#### Using AWS Console

1. Navigate to AWS Cognito console
2. Click "Create user pool"
3. Configure sign-in experience:
   - Select "Email" as sign-in option
   - Select "Federated identity providers"
4. Configure security requirements:
   - Password policy: Set minimum length (8 characters recommended)
   - MFA: Optional (can enable later)
5. Configure sign-up experience:
   - Required attributes: email, name
   - Custom attributes (optional):
     - `custom:role` (String) - user role
     - `custom:allowed_apps` (String) - comma-separated app list
6. Configure message delivery:
   - Email provider: Cognito default or SES
7. Integrate your app:
   - User pool name: `nest-todo-user-pool`
   - App client name: `nest-todo-app-client`
   - Enable "Authorization code grant"
   - Add callback URL: `http://localhost:3000/auth/callback`
8. Review and create

#### Using AWS CLI

```bash
# Create User Pool
aws cognito-idp create-user-pool \
  --pool-name nest-todo-user-pool \
  --auto-verified-attributes email \
  --username-attributes email \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  }' \
  --schema '[
    {
      "Name": "email",
      "AttributeDataType": "String",
      "Required": true,
      "Mutable": true
    },
    {
      "Name": "name",
      "AttributeDataType": "String",
      "Required": false,
      "Mutable": true
    }
  ]'

# Note the UserPoolId from the output
# Example: us-east-1_ABC123XYZ
```

### Step 2: Configure Google OAuth

#### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client ID"
5. Configure OAuth consent screen:
   - User Type: External
   - App name: "NestJS Todo App"
   - User support email: your email
   - Authorized domains: your domain
   - Scopes: email, profile, openid
6. Create OAuth client:
   - Application type: Web application
   - Name: "NestJS Todo App - Production"
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://<your-cognito-domain>.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
7. Save Client ID and Client Secret

#### Configure Google in Cognito

1. In Cognito console, go to your User Pool
2. Navigate to "Sign-in experience" > "Federated identity provider sign-in"
3. Click "Add identity provider"
4. Select "Google"
5. Enter:
   - Google app ID: Your Google Client ID
   - Google app secret: Your Google Client Secret
   - Authorized scopes: `profile email openid`
6. Map attributes:
   - Google attribute `email` → User pool attribute `email`
   - Google attribute `name` → User pool attribute `name`
   - Google attribute `sub` → User pool attribute `username`
7. Save changes

### Step 3: Create App Client

```bash
# Create App Client
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_ABC123XYZ \
  --client-name nest-todo-app-client \
  --generate-secret \
  --allowed-o-auth-flows authorization_code implicit \
  --allowed-o-auth-scopes openid email profile \
  --callback-urls http://localhost:3000/auth/callback \
  --logout-urls http://localhost:3000 \
  --supported-identity-providers COGNITO Google

# Note the ClientId and ClientSecret from the output
```

### Step 4: Set Up Hosted UI Domain

```bash
# Create domain for hosted UI
aws cognito-idp create-user-pool-domain \
  --user-pool-id us-east-1_ABC123XYZ \
  --domain nest-todo-app-dev

# Your hosted UI will be available at:
# https://nest-todo-app-dev.auth.us-east-1.amazoncognito.com
```

## Part 2: NestJS Implementation

### Step 1: Install Dependencies

```bash
npm install --save \
  @aws-sdk/client-cognito-identity-provider \
  aws-jwt-verify \
  jwks-rsa \
  passport \
  passport-jwt \
  @nestjs/passport \
  @nestjs/jwt \
  @nestjs/config

npm install --save-dev \
  @types/passport-jwt
```

### Step 2: Configure Environment Variables

Create `.env` file:

```env
# AWS Cognito Configuration
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_ABC123XYZ
COGNITO_CLIENT_ID=your-app-client-id
COGNITO_CLIENT_SECRET=your-app-client-secret
COGNITO_DOMAIN=https://nest-todo-app-dev.auth.us-east-1.amazoncognito.com

# Application Configuration
APP_URL=http://localhost:3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/nest
```

Create `.env.example` for documentation:

```env
# AWS Cognito Configuration
AWS_REGION=
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
COGNITO_DOMAIN=

# Application Configuration
APP_URL=http://localhost:3000
JWT_SECRET=

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/nest
```

Update `.gitignore`:

```
.env
```

### Step 3: Create Auth Module Structure

```bash
# Create auth module files
mkdir -p src/auth/guards
mkdir -p src/auth/decorators
mkdir -p src/auth/interfaces

# Create files
touch src/auth/auth.module.ts
touch src/auth/auth.controller.ts
touch src/auth/auth.service.ts
touch src/auth/cognito.service.ts
touch src/auth/guards/cognito-auth.guard.ts
touch src/auth/decorators/current-user.decorator.ts
touch src/auth/interfaces/auth-user.interface.ts
```

### Step 4: Implement Configuration Module

**src/config/cognito.config.ts**

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('cognito', () => ({
  region: process.env.AWS_REGION,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  domain: process.env.COGNITO_DOMAIN,
  authority: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
}));
```

### Step 5: Implement Cognito Service

**src/auth/cognito.service.ts**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

@Injectable()
export class CognitoService {
  private client: CognitoIdentityProviderClient;
  private verifier;
  
  constructor(private configService: ConfigService) {
    this.client = new CognitoIdentityProviderClient({
      region: this.configService.get('cognito.region'),
    });
    
    // Create JWT verifier
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: this.configService.get('cognito.userPoolId'),
      tokenUse: 'access',
      clientId: this.configService.get('cognito.clientId'),
    });
  }

  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string, name: string) {
    const command = new SignUpCommand({
      ClientId: this.configService.get('cognito.clientId'),
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
      ],
    });

    try {
      const response = await this.client.send(command);
      return {
        userSub: response.UserSub,
        userConfirmed: response.UserConfirmed,
      };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, code: string) {
    const command = new ConfirmSignUpCommand({
      ClientId: this.configService.get('cognito.clientId'),
      Username: email,
      ConfirmationCode: code,
    });

    try {
      await this.client.send(command);
      return { success: true };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string) {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.configService.get('cognito.clientId'),
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    try {
      const response = await this.client.send(command);
      return {
        accessToken: response.AuthenticationResult?.AccessToken,
        idToken: response.AuthenticationResult?.IdToken,
        refreshToken: response.AuthenticationResult?.RefreshToken,
        expiresIn: response.AuthenticationResult?.ExpiresIn,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string) {
    const command = new ForgotPasswordCommand({
      ClientId: this.configService.get('cognito.clientId'),
      Username: email,
    });

    try {
      await this.client.send(command);
      return { success: true, message: 'Password reset code sent to email' };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  /**
   * Confirm forgot password with code
   */
  async confirmForgotPassword(
    email: string,
    code: string,
    newPassword: string,
  ) {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: this.configService.get('cognito.clientId'),
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    });

    try {
      await this.client.send(command);
      return { success: true, message: 'Password reset successful' };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string) {
    try {
      const payload = await this.verifier.verify(token);
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Get user info from access token
   */
  async getUserInfo(accessToken: string) {
    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    try {
      const response = await this.client.send(command);
      const attributes = {};
      response.UserAttributes?.forEach((attr) => {
        attributes[attr.Name] = attr.Value;
      });
      
      return {
        username: response.Username,
        attributes,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Get Google OAuth login URL
   */
  getGoogleLoginUrl(state?: string): string {
    const domain = this.configService.get('cognito.domain');
    const clientId = this.configService.get('cognito.clientId');
    const redirectUri = `${this.configService.get('APP_URL')}/auth/callback`;
    
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: redirectUri,
      identity_provider: 'Google',
      ...(state && { state }),
    });

    return `${domain}/oauth2/authorize?${params.toString()}`;
  }
}
```

### Step 6: Implement Auth Guard

**src/auth/guards/cognito-auth.guard.ts**

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { CognitoService } from '../cognito.service';

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  constructor(private cognitoService: CognitoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.cognitoService.verifyToken(token);
      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

### Step 7: Implement Current User Decorator

**src/auth/decorators/current-user.decorator.ts**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
```

### Step 8: Implement Auth Controller

**src/auth/auth.controller.ts**

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CognitoService } from './cognito.service';
import { CognitoAuthGuard } from './guards/cognito-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private cognitoService: CognitoService) {}

  /**
   * Sign up endpoint
   */
  @Post('signup')
  async signUp(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('name') name: string,
  ) {
    return this.cognitoService.signUp(email, password, name);
  }

  /**
   * Confirm sign up with verification code
   */
  @Post('confirm-signup')
  async confirmSignUp(
    @Body('email') email: string,
    @Body('code') code: string,
  ) {
    return this.cognitoService.confirmSignUp(email, code);
  }

  /**
   * Sign in endpoint
   */
  @Post('signin')
  async signIn(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.cognitoService.signIn(email, password);
  }

  /**
   * Initiate forgot password
   */
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.cognitoService.forgotPassword(email);
  }

  /**
   * Confirm forgot password
   */
  @Post('reset-password')
  async resetPassword(
    @Body('email') email: string,
    @Body('code') code: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.cognitoService.confirmForgotPassword(email, code, newPassword);
  }

  /**
   * Get Google OAuth login URL
   */
  @Get('google/login')
  async googleLogin(@Res() res: Response) {
    const url = this.cognitoService.getGoogleLoginUrl();
    return res.redirect(url);
  }

  /**
   * OAuth callback endpoint
   */
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    // Exchange authorization code for tokens
    // This is simplified - in production, implement proper OAuth flow
    return res.redirect(`${process.env.APP_URL}?code=${code}`);
  }

  /**
   * Get current user profile
   */
  @Get('profile')
  @UseGuards(CognitoAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    return {
      sub: user.sub,
      username: user.username,
      email: user.email,
    };
  }

  /**
   * Test protected endpoint
   */
  @Get('protected')
  @UseGuards(CognitoAuthGuard)
  async protected() {
    return { message: 'This is a protected route' };
  }
}
```

### Step 9: Implement Auth Module

**src/auth/auth.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { CognitoService } from './cognito.service';
import { CognitoAuthGuard } from './guards/cognito-auth.guard';
import cognitoConfig from '../config/cognito.config';

@Module({
  imports: [
    ConfigModule.forFeature(cognitoConfig),
  ],
  controllers: [AuthController],
  providers: [CognitoService, CognitoAuthGuard],
  exports: [CognitoService, CognitoAuthGuard],
})
export class AuthModule {}
```

### Step 10: Update App Module

**src/app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TodosModule } from './todos/todos.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/nest',
    ),
    TodosModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### Step 11: Update Todo Schema for User Association

**src/todos/schema/todo.schema.ts**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TodoDocument = Todo & Document;

@Schema({ timestamps: true })
export class Todo {
  @Prop({ required: true })
  userId: string; // Cognito user sub

  @Prop({ required: true })
  title: string;

  @Prop({ default: false })
  status: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const TodoSchema = SchemaFactory.createForClass(Todo);

// Create index on userId for faster queries
TodoSchema.index({ userId: 1 });
```

### Step 12: Update Todo Controller to Use Auth

**src/todos/todos.controller.ts**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Todo } from './schema/todo.schema';
import { TodosService } from './todos.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';
import { CognitoAuthGuard } from '../auth/guards/cognito-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('todos')
@UseGuards(CognitoAuthGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Post()
  create(
    @Body() createTodoDto: CreateTodoDto,
    @CurrentUser('sub') userId: string,
  ): Promise<Todo> {
    return this.todosService.create(createTodoDto, userId);
  }

  @Get()
  async findAll(@CurrentUser('sub') userId: string): Promise<Todo[]> {
    return this.todosService.findAllForUser(userId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ): Promise<Todo | null> {
    return this.todosService.findOneTodo(id, userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateTodoDto: UpdateTodoDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.todosService.updateTodo(id, updateTodoDto, userId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ): Promise<Todo | null> {
    return this.todosService.delete(id, userId);
  }
}
```

### Step 13: Update Todo Service

**src/todos/todos.service.ts**

```typescript
import { Model } from 'mongoose';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Todo, TodoDocument } from './schema/todo.schema';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';

@Injectable()
export class TodosService {
  constructor(@InjectModel(Todo.name) private todoModel: Model<TodoDocument>) {}

  async create(createTodoDto: CreateTodoDto, userId: string): Promise<Todo> {
    const newTodo = new this.todoModel({
      userId,
      title: createTodoDto.title,
      status: createTodoDto.status || false,
    });
    return newTodo.save();
  }

  async findAllForUser(userId: string): Promise<Todo[]> {
    return this.todoModel.find({ userId }).exec();
  }

  async findOneTodo(_id: string, userId: string): Promise<Todo | null> {
    const todo = await this.todoModel.findOne({ _id, userId }).exec();
    if (!todo) {
      throw new NotFoundException('Todo not found');
    }
    return todo;
  }

  async updateTodo(
    _id: string,
    updateTodoDto: UpdateTodoDto,
    userId: string,
  ): Promise<Todo | null> {
    const todo = await this.todoModel
      .findOneAndUpdate({ _id, userId }, updateTodoDto, { new: true })
      .exec();
    
    if (!todo) {
      throw new NotFoundException('Todo not found');
    }
    return todo;
  }

  async delete(_id: string, userId: string): Promise<Todo | null> {
    const todo = await this.todoModel.findOneAndDelete({ _id, userId }).exec();
    if (!todo) {
      throw new NotFoundException('Todo not found');
    }
    return todo;
  }
}
```

### Step 14: Update Todo Module

**src/todos/todos.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { Todo, TodoSchema } from './schema/todo.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Todo.name, schema: TodoSchema }]),
    AuthModule,
  ],
  controllers: [TodosController],
  providers: [TodosService],
})
export class TodosModule {}
```

## Part 3: Testing

### Step 1: Test Signup

```bash
# Sign up a new user
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Test123!",
    "name": "Test User"
  }'

# Confirm signup (check email for code)
curl -X POST http://localhost:3000/auth/confirm-signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456"
  }'
```

### Step 2: Test Login

```bash
# Sign in
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Test123!"
  }'

# Response will include accessToken, idToken, refreshToken
# Save the accessToken for next requests
```

### Step 3: Test Protected Routes

```bash
# Get todos (requires authentication)
curl -X GET http://localhost:3000/todos \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Create todo
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My first authenticated todo",
    "status": false
  }'
```

### Step 4: Test Google OAuth

```bash
# Visit in browser
http://localhost:3000/auth/google/login

# This will redirect to Google login
# After successful auth, you'll be redirected back with code
```

### Step 5: Test Forgot Password

```bash
# Initiate forgot password
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'

# Reset password with code
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456",
    "newPassword": "NewPass123!"
  }'
```

## Part 4: Production Considerations

### Security Checklist

- [ ] Use HTTPS in production
- [ ] Store secrets in AWS Secrets Manager or Parameter Store
- [ ] Enable MFA for sensitive operations
- [ ] Implement rate limiting
- [ ] Add request logging and monitoring
- [ ] Enable CloudWatch logs for Cognito
- [ ] Configure CORS properly
- [ ] Add input validation and sanitization
- [ ] Implement token refresh logic
- [ ] Add logout functionality
- [ ] Configure token expiration times appropriately
- [ ] Enable advanced security features in Cognito

### Environment-Specific Configuration

Create separate `.env` files:
- `.env.development`
- `.env.staging`
- `.env.production`

### Monitoring and Logging

```typescript
// Add logging to auth service
import { Logger } from '@nestjs/common';

export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  
  async signIn(email: string, password: string) {
    this.logger.log(`Sign in attempt for user: ${email}`);
    try {
      // ... sign in logic
      this.logger.log(`Sign in successful for user: ${email}`);
    } catch (error) {
      this.logger.error(`Sign in failed for user: ${email}`, error.stack);
      throw error;
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **"Invalid token" error**
   - Check token expiration
   - Verify User Pool ID and Client ID
   - Ensure token is sent with Bearer prefix

2. **"ClientId not found" error**
   - Verify Client ID in .env file
   - Check if app client is created in Cognito

3. **Google OAuth redirect issues**
   - Verify callback URL in Google Console
   - Check Cognito domain configuration
   - Ensure redirect URIs match exactly

4. **Password policy errors**
   - Check Cognito password policy settings
   - Ensure password meets requirements

## Next Steps

1. Implement token refresh logic
2. Add email verification templates
3. Implement logout functionality
4. Add role-based access control (RBAC)
5. Implement multi-factor authentication (MFA)
6. Add social login for Facebook, Apple, etc.
7. Implement session management
8. Add audit logging
9. Create admin panel for user management
10. Write comprehensive tests (unit, integration, e2e)

## References

- [AWS Cognito SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-cognito-identity-provider/)
- [aws-jwt-verify](https://github.com/awslabs/aws-jwt-verify)
- [NestJS Guards](https://docs.nestjs.com/guards)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

---

**Last Updated:** October 31, 2025  
**Version:** 1.0
