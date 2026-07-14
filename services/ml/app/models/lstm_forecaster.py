"""
PyTorch LSTM forecaster for CPU + RAM time-series.

Input:  60 time-steps × 2 features  (cpu_pct, ram_pct)
Output: 30 time-steps × 2 features  (forecast of next 30 minutes)
"""

import os
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import mlflow
from loguru import logger
from datetime import datetime, timedelta, timezone

from app.utils.preprocessor import FORECAST_INPUT_LEN, FORECAST_OUTPUT_LEN

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "saved_models")
MODEL_PATH = os.path.join(MODEL_DIR, "lstm_forecaster.pt")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── Network Architecture ─────────────────────────────────────────────────────

class LSTMNetwork(nn.Module):
    """
    Sequence-to-sequence LSTM.

    Takes (batch, 60, 2) and produces (batch, 30, 2).
    """

    def __init__(
        self,
        input_size: int = 2,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_steps: int = FORECAST_OUTPUT_LEN,
        output_size: int = 2,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.output_steps = output_steps
        self.output_size = output_size

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, output_steps * output_size),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_size)
        lstm_out, _ = self.lstm(x)
        # Use the last hidden state
        last_hidden = lstm_out[:, -1, :]  # (batch, hidden_size)
        out = self.fc(last_hidden)        # (batch, output_steps * output_size)
        out = out.view(-1, self.output_steps, self.output_size)
        return out


# ── Wrapper class ────────────────────────────────────────────────────────────

class LSTMForecaster:
    """High-level train / predict interface around LSTMNetwork."""

    def __init__(self):
        self.model: LSTMNetwork | None = None
        self._is_trained = False
        # Running stats for normalisation
        self._mean: np.ndarray | None = None
        self._std: np.ndarray | None = None

    # ── Training ─────────────────────────────────────────────────────────
    def train(
        self,
        X: torch.Tensor,
        y: torch.Tensor,
        epochs: int = 50,
        batch_size: int = 32,
        learning_rate: float = 1e-3,
    ) -> dict:
        """
        Train the LSTM on sliding-window tensors.

        Parameters
        ----------
        X : Tensor (N, 60, 2)
        y : Tensor (N, 30, 2)
        """
        logger.info(
            f"Training LSTM — windows={X.shape[0]}, "
            f"input_len={X.shape[1]}, output_len={y.shape[1]}, epochs={epochs}"
        )

        # Compute normalisation stats from training inputs
        flat = X.numpy().reshape(-1, 2)
        self._mean = flat.mean(axis=0)
        self._std = flat.std(axis=0)
        self._std[self._std < 1e-6] = 1.0  # avoid division by zero

        # Normalise
        X_norm = (X.numpy() - self._mean) / self._std
        y_norm = (y.numpy() - self._mean) / self._std
        X_t = torch.tensor(X_norm, dtype=torch.float32)
        y_t = torch.tensor(y_norm, dtype=torch.float32)

        dataset = TensorDataset(X_t, y_t)
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        self.model = LSTMNetwork().to(DEVICE)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)
        criterion = nn.MSELoss()

        self.model.train()
        final_loss = 0.0
        for epoch in range(epochs):
            epoch_loss = 0.0
            n_batches = 0
            for xb, yb in loader:
                xb, yb = xb.to(DEVICE), yb.to(DEVICE)
                optimizer.zero_grad()
                pred = self.model(xb)
                loss = criterion(pred, yb)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item()
                n_batches += 1
            avg_loss = epoch_loss / max(n_batches, 1)
            final_loss = avg_loss
            if (epoch + 1) % 10 == 0 or epoch == 0:
                logger.info(f"  Epoch {epoch + 1}/{epochs} — loss: {avg_loss:.6f}")

        self._is_trained = True

        # Persist
        os.makedirs(MODEL_DIR, exist_ok=True)
        torch.save({
            "model_state": self.model.state_dict(),
            "mean": self._mean,
            "std": self._std,
        }, MODEL_PATH)
        logger.info(f"LSTM forecaster saved to {MODEL_PATH}")

        # MLflow logging (best-effort)
        try:
            mlflow.log_params({
                "lstm_epochs": epochs,
                "lstm_batch_size": batch_size,
                "lstm_lr": learning_rate,
                "lstm_n_windows": int(X.shape[0]),
            })
            mlflow.log_metric("lstm_final_mse", final_loss)
        except Exception as e:
            logger.warning(f"MLflow logging skipped: {e}")

        return {
            "model": "lstm_forecaster",
            "n_windows": int(X.shape[0]),
            "epochs": epochs,
            "final_mse": round(final_loss, 6),
        }

    # ── Inference ────────────────────────────────────────────────────────
    def predict(
        self,
        X: torch.Tensor,
        last_timestamp: str | None = None,
    ) -> dict:
        """
        Forecast next 30 time-steps of CPU and RAM.

        Parameters
        ----------
        X : Tensor of shape (1, 60, 2)
        last_timestamp : ISO string of the last known data point.

        Returns
        -------
        dict with keys:
            forecast            : list of {timestamp, cpu_pct, ram_pct}
            confidence_interval : float (estimated ± range)
        """
        if not self._is_trained or self.model is None:
            raise RuntimeError("Model has not been trained yet")

        self.model.eval()
        with torch.no_grad():
            # Normalise
            X_np = X.numpy()
            X_norm = (X_np - self._mean) / self._std
            X_t = torch.tensor(X_norm, dtype=torch.float32).to(DEVICE)
            pred_norm = self.model(X_t).cpu().numpy()  # (1, 30, 2)

        # Denormalise
        predictions = pred_norm * self._std + self._mean
        predictions = predictions[0]  # (30, 2)

        # Clip to valid ranges
        predictions[:, 0] = np.clip(predictions[:, 0], 0, 100)  # cpu
        predictions[:, 1] = np.clip(predictions[:, 1], 0, 100)  # ram

        # Build timestamps — 1-minute intervals from the last known point
        if last_timestamp:
            try:
                base_time = datetime.fromisoformat(last_timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                base_time = datetime.now(timezone.utc)
        else:
            base_time = datetime.now(timezone.utc)

        forecast_points = []
        for i in range(FORECAST_OUTPUT_LEN):
            ts = base_time + timedelta(minutes=i + 1)
            forecast_points.append({
                "timestamp": ts.isoformat(),
                "cpu_pct": round(float(predictions[i, 0]), 2),
                "ram_pct": round(float(predictions[i, 1]), 2),
            })

        # Dynamic confidence interval based on prediction variance
        pred_std = float(np.std(predictions))
        confidence_interval = round(min(pred_std * 1.96, 25.0), 2)

        return {
            "forecast": forecast_points,
            "confidence_interval": confidence_interval,
        }

    # ── Persistence helpers ──────────────────────────────────────────────
    def load(self) -> bool:
        """Load a previously saved model. Returns True on success."""
        if os.path.exists(MODEL_PATH):
            checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
            self.model = LSTMNetwork().to(DEVICE)
            self.model.load_state_dict(checkpoint["model_state"])
            self._mean = checkpoint["mean"]
            self._std = checkpoint["std"]
            self._is_trained = True
            logger.info("LSTM forecaster loaded from disk")
            return True
        logger.warning("No saved LSTM forecaster found")
        return False

    @property
    def is_trained(self) -> bool:
        return self._is_trained
