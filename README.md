# Bus Booking App

A React/Vite client and Express API for searching bus journeys and creating bookings through the Uniglade Partner API.

## Prerequisites

- Node.js 22.12 or newer (or Node.js 20.19 or newer)
- npm
- Uniglade partner API credentials and an enabled partner account

## Setup

Install the server dependencies and create a local environment file from the template:

```powershell
cd server
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `server/.env` and replace the placeholder client ID, client secret, and payment-confirmation secret with credentials supplied for your partner account. The API base URL is already set in the example. Do not commit `.env` or put credentials in client-side code.

Install the client dependencies in a second terminal:

```powershell
cd client
npm install
```

The client defaults to `http://localhost:5000/api`. If the API is running elsewhere, set `VITE_API_BASE_URL` in `client/.env` to the API URL, for example `http://localhost:5000/api`.

## Run Locally

Start the API in one terminal:

```powershell
cd server
npm run dev
```

The API listens on `http://localhost:5000`. Check that it is running at `http://localhost:5000/api/health`.

Start the client in another terminal:

```powershell
cd client
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173/`.

## Booking Flow

1. Enter origin, destination, and travel date, then search.
2. Select a journey and enter passenger and contact details.
3. Create the booking. The client displays the PNR and booking details returned by Uniglade.
4. Complete any journey-specific passenger requirements and submit them to initiate payment.

The client calls the local API, which requests access tokens and calls Uniglade. Search uses `GET /api/buses/search`; booking creation uses `POST /api/buses/bookings`; passenger submission and payment initiation use `POST /api/buses/bookings/:bookingId/complete`.

Payment initiation returns a pending payment. It does not mean funds have been verified, and a ticket is not issued until the verified-payment confirmation and ticket-processing steps are completed by the partner integration.

## Checks

Run the server TypeScript build:

```powershell
cd server
npm run build
```

Build and lint the client:

```powershell
cd client
npm run build
npm run lint
```
