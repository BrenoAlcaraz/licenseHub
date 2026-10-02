# Spec — Real-time alert (WebSocket)

Notify IT immediately when a product is nearly full, before an assignment receives a 409 because no seats remain.

## Channel

- **Socket.IO** runs on the same server and port as the API (`http://localhost:3000`) in the default namespace (`/`).
- NestJS gateway: `SeatsThresholdGateway` in the `licenses` module.
- No authentication, consistent with the rest of the API and the defined scope.

## `seats.threshold` event

Broadcast to **all connected clients** when a successful assignment leaves the product at **90% or more** seat usage.

```json
{ "productId": "…", "productName": "Microsoft 365 E3", "seatsInUse": 9, "totalSeats": 10 }
```

- `seatsInUse` includes the assignment that just completed.
- The threshold uses integer arithmetic: `seatsInUse × 100 ≥ totalSeats × 90`. This avoids floating-point edge cases and allows the percentage to change safely.
- The event is emitted **after the transaction commits**, so clients are never notified about an assignment that was not persisted.
- Only assignments emit this event. Revocation, offboarding, and `totalSeats` changes do not.

## Acceptance criteria

### RT-AC01 — alerts when usage reaches 90% [unit]
- Given a product with `totalSeats = 10` and 8 seats in use
- When a license is assigned successfully, reaching 9/10
- Then `seats.threshold` is emitted with `seatsInUse = 9` and `totalSeats = 10`

### RT-AC02 — does not alert below 90% [unit]
- Given a product with `totalSeats = 10` and 7 seats in use
- When a license is assigned successfully, reaching 8/10
- Then no event is emitted

### RT-AC03 — continues alerting above 90% [unit]
- Given a product with `totalSeats = 10` and 9 seats in use
- When the final seat is assigned
- Then the event is emitted with `seatsInUse = 10`

### RT-AC04 — alerts exactly at the threshold [unit]
- Given a product with `totalSeats = 70` and 62 seats in use
- When an assignment reaches 63/70, exactly 90%
- Then the event is emitted because the threshold is inclusive

### RT-AC05 — rejected assignments do not alert [unit]
- When an assignment fails with 404 or any 409 business-rule error
- Then no event is emitted

### RT-AC06 — emits only after commit [unit]
- When an assignment reaches the threshold
- Then the event is emitted after the transaction finishes, not inside it

### RT-AC07 — a connected client receives the event [e2e] (E2E-10)
- Given a Socket.IO client connected to `ws://localhost:<port>/socket.io/`
- When `POST /licenses` brings a product to 9/10
- Then the client receives `seats.threshold` with the payload above
