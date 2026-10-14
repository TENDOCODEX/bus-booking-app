import busesRouter from "./routes/buses.routes";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/buses", busesRouter);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Bus Booking API backend is running"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "Bus Booking API",
    status: "healthy"
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
