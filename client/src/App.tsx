
import { useEffect, useRef, useState } from "react";
import "./App.css";

type Journey = {
  offerId: string;
  operator?: { name?: string };
  origin?: { name?: string };
  destination?: { name?: string };
  departureTime?: string;
  arrivalTime?: string;
  amount?: number;
  currency?: string;
  seatSelectionAvailable?: boolean;
  seatMap?: { availableCount?: number };
};

type Requirement = {
  key: string;
  required?: boolean;
  type?: string;
  options?: string[];
};

type Booking = {
  bookingId: string;
  externalReference: string;
  pnr?: string;
  status?: string;
  paymentStatus?: string;
  ticketStatus?: string;
  amount?: number;
  currency?: string;
  passengers?: { name?: string; seatNumber?: string | null }[];
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

function App() {
  const [origin, setOrigin] = useState("Harare");
  const [destination, setDestination] = useState("Bulawayo");
  const [departureDate, setDepartureDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selected, setSelected] = useState<Journey | null>(null);
  const [passenger, setPassenger] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    age: "",
    seatNumber: ""
  });
  const [externalReference, setExternalReference] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookingBusy, setBookingBusy] = useState(false);
  const [payment, setPayment] = useState<Record<string, unknown> | null>(null);
  const bookingPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selected) {
      bookingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selected, booking]);

  async function searchBuses(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setJourneys([]);
    setSelected(null);
    setBooking(null);
    setPayment(null);
    setExternalReference("");

    if (!origin.trim() || !destination.trim() || !departureDate) {
      setError("Please enter an origin, destination and travel date.");
      return;
    }

    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
      setError("Origin and destination must be different.");
      return;
    }

    if (departureDate < new Date().toLocaleDateString("en-CA")) {
      setError("Please select a future travel date.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        origin: origin.trim(),
        destination: destination.trim(),
        departureDate
      });

      const response = await fetch(`${API_BASE_URL}/buses/search?${params}`);
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Journey search failed.");
      }

      const data = result.data;
      const results = Array.isArray(data)
        ? data
        : data?.results ?? [];

      setJourneys(results);
      if (results.length === 0) {
        setError("No journeys were returned for this search.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to contact the bus booking service."
      );
    } finally {
      setLoading(false);
    }
  }

  function selectJourney(journey: Journey) {
    setSelected(journey);
    setBooking(null);
    setPayment(null);
    setRequirements([]);
    setAnswers({});
    setExternalReference("");
    setPassenger({ firstName: "", lastName: "", email: "", phone: "", age: "", seatNumber: "" });
    setError("");
  }

  async function createBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (selected.seatSelectionAvailable && !passenger.seatNumber.trim()) {
      setError("Select a seat before creating this booking.");
      return;
    }

    setError("");
    setBookingBusy(true);
    const reference = externalReference || `NTG-${crypto.randomUUID()}`;
    setExternalReference(reference);

    try {
      const response = await fetch(`${API_BASE_URL}/buses/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalReference: reference,
          offerId: selected.offerId,
          travelDate: departureDate,
          currency: selected.currency || "USD",
          contact: {
            firstName: passenger.firstName.trim(),
            lastName: passenger.lastName.trim(),
            email: passenger.email.trim(),
            phone: passenger.phone.trim()
          },
          passengers: [{
            firstName: passenger.firstName.trim(),
            lastName: passenger.lastName.trim(),
            age: Number(passenger.age),
            ...(passenger.seatNumber.trim() ? { seatNumber: passenger.seatNumber.trim() } : {})
          }]
        })
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Unable to create the booking.");
      }

      setBooking(result.data.booking);
      setRequirements(result.data.passengerRequirements?.fields ?? []);
      setAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the booking.");
    } finally {
      setBookingBusy(false);
    }
  }

  async function completeBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!booking) return;
    const missingAnswer = requirements.find(field =>
      field.required && !answers[field.key]?.trim()
    );
    if (missingAnswer) {
      setError(`Please provide ${missingAnswer.key}.`);
      return;
    }

    setError("");
    setBookingBusy(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/buses/bookings/${encodeURIComponent(booking.bookingId)}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalPaymentReference: `PAY-${booking.bookingId}`,
            contact: {
              firstName: passenger.firstName.trim(),
              lastName: passenger.lastName.trim(),
              email: passenger.email.trim(),
              phone: passenger.phone.trim(),
              optInMarketing: false
            },
            passengers: [{
              firstName: passenger.firstName.trim(),
              lastName: passenger.lastName.trim(),
              age: Number(passenger.age),
              ...(passenger.seatNumber.trim() ? { seatNumber: passenger.seatNumber.trim() } : {}),
              questionAnswers: answers
            }]
          })
        }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Unable to submit passenger details.");
      }

      setPayment(result.data.payment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete the booking.");
    } finally {
      setBookingBusy(false);
    }
  }

  const apiPassenger = booking?.passengers?.[0];
  const passengerSummary = apiPassenger?.name || `${passenger.firstName} ${passenger.lastName}`;
  const passengerSeat = apiPassenger?.seatNumber || passenger.seatNumber;

  return (
    <main className="page">
      <header className="header">
        <div className="brand">NT<span>G</span></div>
        <div>
          <strong>National Tickets</strong>
          <p>Travel made simpler</p>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">YOUR JOURNEY STARTS HERE</p>
        <h1>Where would you like to go?</h1>
        <p>Search available bus journeys and choose the trip that suits you.</p>

        <form className="search" onSubmit={searchBuses}>
          <label>
            From
            <input value={origin} onChange={e => setOrigin(e.target.value)}
              placeholder="Origin city" required />
          </label>

          <label>
            To
            <input value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="Destination city" required />
          </label>

          <label>
            Departure date
            <input type="date" value={departureDate}
              min={new Date().toLocaleDateString("en-CA")}
              onChange={e => setDepartureDate(e.target.value)} required />
          </label>

          <button disabled={loading}>
            {loading ? "Searching..." : "Search buses"}
          </button>
        </form>
      </section>

      <section className="results">
        <h2>Available journeys</h2>
        {error && !selected && <div className="notice" role="alert">{error}</div>}

        {journeys.map(journey => (
          <article className="journey" key={journey.offerId}>
            <div>
              <h3>{journey.operator?.name || "Bus operator"}</h3>
              <p>{journey.origin?.name || origin} →{" "}
                {journey.destination?.name || destination}</p>
              <p>Departure: {journey.departureTime
                ? new Date(journey.departureTime).toLocaleString()
                : "Not provided"}</p>
              <p>Arrival: {journey.arrivalTime
                ? new Date(journey.arrivalTime).toLocaleString()
                : "Not provided"}</p>
              {journey.seatMap?.availableCount !== undefined &&
                <p>Seats available: {journey.seatMap.availableCount}</p>}
            </div>
            <div className="fare">
              <strong>{journey.amount !== undefined
                ? `${journey.currency || "USD"} ${journey.amount.toFixed(2)}`
                : "Fare unavailable"}</strong>
              <button type="button" onClick={() => selectJourney(journey)}>
                Select bus
              </button>
            </div>
          </article>
        ))}

        {selected && !booking && (
          <section ref={bookingPanelRef} className="booking-panel" aria-labelledby="booking-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">SELECTED JOURNEY</p>
                <h2 id="booking-title">Passenger details</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setSelected(null)}>
                Change bus
              </button>
            </div>
            <p className="selected-summary">
              {selected.operator?.name || "Bus operator"} · {selected.origin?.name || origin} to {selected.destination?.name || destination}
            </p>
            {error && <div className="notice" role="alert">{error}</div>}
            <form className="passenger-form" onSubmit={createBooking}>
              <label>First name<input required autoComplete="given-name" value={passenger.firstName} onChange={e => setPassenger({ ...passenger, firstName: e.target.value })} /></label>
              <label>Last name<input required autoComplete="family-name" value={passenger.lastName} onChange={e => setPassenger({ ...passenger, lastName: e.target.value })} /></label>
              <label>Email<input required type="email" autoComplete="email" value={passenger.email} onChange={e => setPassenger({ ...passenger, email: e.target.value })} /></label>
              <label>Phone<input required type="tel" autoComplete="tel" value={passenger.phone} onChange={e => setPassenger({ ...passenger, phone: e.target.value })} /></label>
              <label>Age<input required type="number" min="1" max="120" value={passenger.age} onChange={e => setPassenger({ ...passenger, age: e.target.value })} /></label>
              {selected.seatSelectionAvailable && (
                <label>Seat number<input required value={passenger.seatNumber} onChange={e => setPassenger({ ...passenger, seatNumber: e.target.value })} placeholder="e.g. 12A" /></label>
              )}
              <div className="form-actions">
                <button disabled={bookingBusy}>
                  {bookingBusy ? "Creating booking..." : "Create booking"}
                </button>
              </div>
            </form>
          </section>
        )}

        {booking && (
          <section ref={bookingPanelRef} className="booking-panel" aria-labelledby="booking-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">BOOKING {payment ? "INITIATED" : "CREATED"}</p>
                <h2 id="booking-title">Your booking details</h2>
              </div>
              <span className={`status ${payment ? "status-pending" : ""}`}>
                {payment ? String(payment.status || "payment pending") : booking.status || "created"}
              </span>
            </div>
            {error && <div className="notice" role="alert">{error}</div>}
            <dl className="booking-details">
              <div><dt>PNR / booking reference</dt><dd>{booking.pnr || booking.externalReference || booking.bookingId}</dd></div>
              <div><dt>Booking ID</dt><dd>{booking.bookingId}</dd></div>
              <div><dt>Partner reference</dt><dd>{booking.externalReference || externalReference}</dd></div>
              <div><dt>Journey</dt><dd>{selected?.origin?.name || origin} to {selected?.destination?.name || destination}</dd></div>
              <div><dt>Travel date</dt><dd>{departureDate}</dd></div>
              <div><dt>Passenger</dt><dd>{passengerSummary}{passengerSeat ? ` · Seat ${passengerSeat}` : ""}</dd></div>
              <div><dt>Fare</dt><dd>{booking.amount !== undefined ? `${booking.currency || selected?.currency || "USD"} ${Number(booking.amount).toFixed(2)}` : "Confirmed by provider"}</dd></div>
              <div><dt>Booking status</dt><dd>{booking.status || "created"}</dd></div>
              <div><dt>Payment status</dt><dd>{String(payment?.status || booking.paymentStatus || "pending")}</dd></div>
              <div><dt>Ticket status</dt><dd>{booking.ticketStatus || "not issued"}</dd></div>
              {booking.createdAt && <div><dt>Created</dt><dd>{new Date(booking.createdAt).toLocaleString()}</dd></div>}
              {booking.expiresAt && <div><dt>Expires</dt><dd>{new Date(booking.expiresAt).toLocaleString()}</dd></div>}
              {payment && <div><dt>Payment ID</dt><dd>{String(payment.paymentId || `PAY-${booking.bookingId}`)}</dd></div>}
            </dl>

            {!payment && (
              <form className="requirements-form" onSubmit={completeBooking}>
                <h3>Passenger requirements</h3>
                {requirements.length === 0 && <p>No additional details are required for this journey.</p>}
                {requirements.map(field => (
                  <label key={field.key}>
                    {field.key.replace(/[_-]/g, " ")}{field.required ? " *" : ""}
                    {field.options?.length ? (
                      <select required={field.required} value={answers[field.key] || ""} onChange={e => setAnswers({ ...answers, [field.key]: e.target.value })}>
                        <option value="">Choose an option</option>
                        {field.options.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input required={field.required} type={field.type === "date" ? "date" : "text"} value={answers[field.key] || ""} onChange={e => setAnswers({ ...answers, [field.key]: e.target.value })} />
                    )}
                  </label>
                ))}
                <div className="payment-note">Payment will be initiated as a bank transfer and remains pending until verified.</div>
                <button disabled={bookingBusy}>
                  {bookingBusy ? "Submitting details..." : "Submit details and initiate payment"}
                </button>
              </form>
            )}
            {payment && <p className="payment-note">Payment is awaiting provider verification. Your ticket will be available after payment confirmation and ticket processing.</p>}
          </section>
        )}
      </section>

      <footer>National Tickets Global · Bus Booking Assessment</footer>
    </main>
  );
}

export default App;
