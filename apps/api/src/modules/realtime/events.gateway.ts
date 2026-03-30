import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: "*"
  },
  namespace: "events"
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    client.emit("welcome", {
      message: "KiJu Realtime Gateway verbunden"
    });
  }

  handleDisconnect() {
    // Placeholder for future audit logging and waiter/kitchen presence tracking.
  }
}
