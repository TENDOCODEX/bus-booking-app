
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.UNIGLADE_BASE_URL;
const CLIENT_ID = process.env.UNIGLADE_CLIENT_ID;
const CLIENT_SECRET = process.env.UNIGLADE_CLIENT_SECRET;

if (!BASE_URL || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing Uniglade API environment variables");
}

const baseUrl = BASE_URL.replace(/\/+$/, "");
const clientId = CLIENT_ID;
const clientSecret = CLIENT_SECRET;

function authenticatedHeaders(token: string, idempotencyKey?: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
  };
}

export async function getAccessToken(): Promise<string> {
  const response = await axios.post(
    `${baseUrl}/auth/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      timeout: 15000
    }
  );

  if (!response.data?.success || !response.data?.data?.accessToken) {
    throw new Error("The API did not return an access token");
  }

  return response.data.data.accessToken as string;
}

export async function searchJourneys(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
}) {
  const token = await getAccessToken();

  const response = await axios.get(`${baseUrl}/buses/search`, {
    params: {
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      adults: params.adults ?? 1,
      currency: "USD"
    },
    headers: authenticatedHeaders(token),
    timeout: 20000
  });

  return response.data;
}

export async function createBooking(
  booking: Record<string, unknown>,
  idempotencyKey: string
) {
  const token = await getAccessToken();
  const response = await axios.post(`${baseUrl}/bookings`, booking, {
    headers: {
      ...authenticatedHeaders(token, idempotencyKey),
      "Content-Type": "application/json"
    },
    timeout: 20000
  });

  return response.data;
}

export async function getPassengerRequirements(bookingId: string) {
  const token = await getAccessToken();
  const response = await axios.get(
    `${baseUrl}/bookings/${encodeURIComponent(bookingId)}/passenger-requirements`,
    { headers: authenticatedHeaders(token), timeout: 20000 }
  );

  return response.data;
}

export async function updatePassengers(
  bookingId: string,
  passengers: Record<string, unknown>[],
  contact: Record<string, unknown>,
  idempotencyKey: string
) {
  const token = await getAccessToken();
  const response = await axios.post(
    `${baseUrl}/bookings/${encodeURIComponent(bookingId)}/passengers`,
    { passengers, contact },
    {
      headers: {
        ...authenticatedHeaders(token, idempotencyKey),
        "Content-Type": "application/json"
      },
      timeout: 20000
    }
  );

  return response.data;
}

export async function initiatePayment(
  bookingId: string,
  externalPaymentReference: string,
  idempotencyKey: string
) {
  const token = await getAccessToken();
  const response = await axios.post(
    `${baseUrl}/bookings/${encodeURIComponent(bookingId)}/payment`,
    { method: "bank_transfer", externalPaymentReference },
    {
      headers: {
        ...authenticatedHeaders(token, idempotencyKey),
        "Content-Type": "application/json"
      },
      timeout: 20000
    }
  );

  return response.data;
}
