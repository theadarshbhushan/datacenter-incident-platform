from pydantic import BaseModel

class PredictionRequest(BaseModel):
    server_id: str
    include_forecast: bool = True
    include_anomaly_detection: bool = True
    include_classification: bool = True

class AnomalyResult(BaseModel):
    anomaly_score: float
    is_anomaly: bool

class ClassificationResult(BaseModel):
    incident_type: str
    confidence: float

class ForecastPoint(BaseModel):
    timestamp: str
    cpu_pct: float
    ram_pct: float

class ForecastResult(BaseModel):
    forecast: list[ForecastPoint]
    confidence_interval: float

class PredictionResponse(BaseModel):
    server_id: str
    anomaly: AnomalyResult | None = None
    classification: ClassificationResult | None = None
    forecast: ForecastResult | None = None
    incident_created: bool = False
    incident_id: str | None = None
