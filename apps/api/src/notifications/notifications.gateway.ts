import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import { resolveAuthUser } from '../auth/auth.lookup.js';
import type { AuthUser } from '../auth/auth.types.js';

export const orgRoom = (id: string) => `org:${id}`;
export const userRoom = (id: string) => `user:${id}`;

/** Read lazily: decorators run before ConfigModule has validated the environment. */
function allowedOrigin(origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) {
  const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim());
  cb(null, !origin || allowed.includes(origin));
}

/**
 * Real-time channel: Socket.IO namespace `/events`.
 *
 * Client:  io('<api>/events', { auth: { token: '<JWT>' } })
 * Server → client event: `notification` with the same JSON as GET /api/notifications.
 *
 * Each socket joins a room for its organization and one for its user, so a
 * notification reaches every open tab or phone of that account. Sockets are
 * only ever written to; clients act through the REST API.
 */
@WebSocketGateway({ namespace: '/events', cors: { origin: allowedOrigin } })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly log = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async handleConnection(socket: Socket) {
    const fromAuth = socket.handshake.auth?.token as string | undefined;
    const fromHeader = socket.handshake.headers.authorization?.replace(/^Bearer /, '');
    const token = fromAuth ?? fromHeader;

    const user = token ? await resolveAuthUser(this.jwt, this.db, token) : null;
    if (!user) {
      socket.emit('auth_error', { code: token ? 'TOKEN_INVALID' : 'AUTH_REQUIRED' });
      socket.disconnect(true);
      return;
    }
    socket.data.user = user satisfies AuthUser;
    await socket.join(userRoom(user.id));
    if (user.orgId) await socket.join(orgRoom(user.orgId));
    socket.emit('ready', { userId: user.id, orgId: user.orgId });
  }

  emitTo(room: string, event: string, payload: unknown) {
    this.server.to(room).emit(event, payload);
  }

  get connections() {
    return this.server.sockets.size;
  }

  onError(e: unknown) {
    this.log.error(e);
  }
}
