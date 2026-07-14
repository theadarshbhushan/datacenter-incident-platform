"""
POST /forecast

Receives the last 60 metric data points for a server and returns a
30-point forecast of CPU and RAM usage via the LSTM model.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from app.utils.preprocessor import prepare_forecast_sequences

router = APIRouter(tags=["Forecasting"])


class ForecastRequest(BaseModel):
    server_id: str
    metrics: list[dict]


class ForecastPoint(BaseModel):
    timestamp: str
    cpu_pct: float
    ram_pct: float


class ForecastData(BaseModel):
    forecast: list[ForecastPoint]
    confidence_interval: float


class ForecastResponse(BaseModel):
    status: str = "ok"
    server_id: str
    data: ForecastData


@router.post("/forecast", response_model=ForecastResponse)
async def forecast(payload: ForecastRequest):
    from app.main import lstm_forecaster  # deferred import

    if not payload.metrics:
        raise HTTPException(status_code=400, detail="Metrics list is empty")

    if not lstm_forecaster.is_trained:
        raise HTTPException(
            status_code=503,
            detail="Forecast model is not trained yet. Call POST /train first.",
        )

    try:
        X, _ = prepare_forecast_sequences(payload.metrics)

        # Determine the last timestamp in the input series
        last_ts = None
        for m in reversed(payload.metrics):
            if "timestamp" in m:
                last_ts = m["timestamp"]
                break

        result = lstm_forecaster.predict(X, last_timestamp=last_ts)

        forecast_points = [ForecastPoint(**pt) for pt in result["forecast"]]

        logger.info(
            f"Forecast for {payload.server_id}: "
            f"{len(forecast_points)} points, CI={result['confidence_interval']}"
        )

        return ForecastResponse(
            server_id=payload.server_id,
            data=ForecastData(
                forecast=forecast_points,
                confidence_interval=result["confidence_interval"],
            ),
        )
    except Exception as e:
        logger.error(f"Forecast failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
