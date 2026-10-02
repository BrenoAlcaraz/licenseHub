import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export const SEATS_THRESHOLD_EVENT = 'seats.threshold';

export interface SeatsThresholdEvent {
  productId: string;
  productName: string;
  seatsInUse: number;
  totalSeats: number;
}

// Socket.IO on the same server/port as the HTTP API. The gateway only
// delivers messages; deciding *when* to notify is a rule of LicensesService.
@WebSocketGateway()
export class SeatsThresholdGateway {
  @WebSocketServer()
  private readonly server: Server;

  notifySeatsThreshold(event: SeatsThresholdEvent): void {
    this.server.emit(SEATS_THRESHOLD_EVENT, event);
  }
}
