
import { Router, Request, Response } from "express";
import axios from "axios";
import { createHash } from "node:crypto";
import {
  createBooking,
  getPassengerRequirements,
  initiatePayment,
  searchJourneys,
  updatePassengers
} from "../services/uniglade.service";

const router = Router();

function providerError(error: unknown, res: Response) {
  if (axios.isAxiosError(error)) {
    const providerError = error.response?.data?.error;
    const status = error.response?.status;
    console.error("Uniglade API error:", {
      status,
      code: providerError?.code,
      requestId: error.response?.data?.requestId
    });

    let message = providerError?.message;
    if (typeof message === "string") {
      const jsonStart = message.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const nestedError = JSON.parse(message.slice(jsonStart))?.error;
          if (typeof nestedError?.details === "string") {
            message = `${nestedError.details}. Review the passenger answer and retry.`;
          }
        } catch {}
      }
    }

    return res.status(status && status >= 400 ? status : 502).json({
      success: false,
      message: typeof message === "string"
        ? message
        : "The bus provider could not complete the request.",
      code: providerError?.code,
      requestId: error.response?.data?.requestId
    });
  }

  console.error("Unexpected bus booking error:", error);
  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred."
  });
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pickFields(value: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(
    fields.filter(field => value[field] !== undefined).map(field => [field, value[field]])
  );
}

function payloadIdempotencyKey(prefix: string, resourceId: string, payload: unknown) {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 20);

  return `${prefix}-${resourceId}-${digest}`;
}

function unwrap(response: any) {
  return response?.data ?? response;
}

router.get("/search", async (req: Request, res: Response) => {
  const { origin, destination, departureDate } = req.query;

  if (
    typeof origin !== "string" ||
    !origin.trim() ||
    typeof destination !== "string" ||
    !destination.trim() ||
    !isValidDate(departureDate)
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide origin, destination and departureDate in YYYY-MM-DD format."
    });
  }

  if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
    return res.status(400).json({
      success: false,
      message: "Origin and destination must be different."
    });
  }

  try {
    const data = await searchJourneys({
      origin: origin.trim(),
      destination: destination.trim(),
      departureDate
    });

    return res.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Uniglade API error:", {
        status: error.response?.status,
        requestId: error.response?.data?.requestId
      });

      return res.status(error.response?.status || 502).json({
        success: false,
        message: "Unable to search journeys through the bus provider.",
        providerStatus: error.response?.status
      });
    }

    console.error("Unexpected journey search error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred."
    });
  }
});

router.post("/bookings", async (req: Request, res: Response) => {
  const { externalReference, offerId, travelDate, contact, passengers } = req.body ?? {};

  if (
    !isNonEmptyString(externalReference) ||
    !isNonEmptyString(offerId) ||
    !isValidDate(travelDate) ||
    !contact ||
    !isNonEmptyString(contact.firstName) ||
    !isNonEmptyString(contact.lastName) ||
    !isNonEmptyString(contact.email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ||
    !isNonEmptyString(contact.phone) ||
    !Array.isArray(passengers) ||
    passengers.length !== 1 ||
    !isNonEmptyString(passengers[0]?.firstName) ||
    !isNonEmptyString(passengers[0]?.lastName) ||
    !Number.isInteger(passengers[0]?.age) ||
    passengers[0].age < 1 ||
    passengers[0].age > 120
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid offer, travel date, contact and one passenger."
    });
  }

  try {
    const bookingResponse = await createBooking(
      {
        externalReference: externalReference.trim(),
        offerId,
        travelDate,
        currency: typeof req.body.currency === "string" && /^[A-Z]{3}$/.test(req.body.currency)
          ? req.body.currency
          : "USD",
        contact: pickFields(contact, ["firstName", "lastName", "email", "phone"]),
        passengers: passengers.map((passenger: Record<string, unknown>) =>
          pickFields(passenger, ["firstName", "lastName", "age", "seatNumber"])
        )
      },
      `booking-${externalReference.trim()}`
    );
    const booking = unwrap(bookingResponse);
    const bookingId = booking?.bookingId;

    if (!isNonEmptyString(bookingId)) {
      return res.status(502).json({
        success: false,
        message: "The provider created no usable booking reference."
      });
    }

    const requirementsResponse = await getPassengerRequirements(bookingId);
    const requirements = unwrap(requirementsResponse);

    return res.status(201).json({
      success: true,
      data: {
        booking,
        passengerRequirements: {
          ...(requirements?.passengerRequirements ?? {}),
          fields: Array.isArray(requirements?.passengerRequirements?.fields)
            ? requirements.passengerRequirements.fields
            : []
        }
      },
      requestId: bookingResponse?.requestId ?? requirementsResponse?.requestId
    });
  } catch (error) {
    return providerError(error, res);
  }
});

router.post("/bookings/:bookingId/complete", async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const { contact, passengers, externalPaymentReference } = req.body ?? {};

  if (
    !isNonEmptyString(bookingId) ||
    !contact ||
    !isNonEmptyString(contact.firstName) ||
    !isNonEmptyString(contact.lastName) ||
    !isNonEmptyString(contact.email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ||
    !isNonEmptyString(contact.phone) ||
    !Array.isArray(passengers) ||
    passengers.length !== 1 ||
    !isNonEmptyString(passengers[0]?.firstName) ||
    !isNonEmptyString(passengers[0]?.lastName) ||
    !Number.isInteger(passengers[0]?.age) ||
    passengers[0].age < 1 ||
    passengers[0].age > 120 ||
    !isNonEmptyString(externalPaymentReference)
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide valid passenger details and a payment reference."
    });
  }

  try {
    const passengerPayload = {
      passengers: passengers.map((passenger: Record<string, unknown>) =>
        pickFields(passenger, [
          "firstName", "lastName", "age", "seatNumber", "phone", "gender",
          "dateOfBirth", "idType", "idNumber", "questionAnswers", "answers"
        ])
      ),
      contact: pickFields(contact, ["firstName", "lastName", "email", "phone", "optInMarketing"])
    };
    const passengerResponse = await updatePassengers(
      bookingId,
      passengerPayload.passengers,
      passengerPayload.contact,
      payloadIdempotencyKey("passengers", bookingId, passengerPayload)
    );
    const paymentResponse = await initiatePayment(
      bookingId,
      externalPaymentReference.trim(),
      `payment-${bookingId}`
    );

    return res.json({
      success: true,
      data: {
        passengerSubmission: unwrap(passengerResponse),
        payment: unwrap(paymentResponse)
      },
      requestId: paymentResponse?.requestId ?? passengerResponse?.requestId
    });
  } catch (error) {
    return providerError(error, res);
  }
});

export default router;
