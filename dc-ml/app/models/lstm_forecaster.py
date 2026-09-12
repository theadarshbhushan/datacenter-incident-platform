"""
PyTorch Bi-LSTM Forecaster with Temporal Attention for CPU + RAM time-series.

Input:  60 time-steps × 2 features (cpu_pct, ram_pct)
Output: Forecasted time-steps × 2 features (cpu_pct, ram_pct)
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    import mlflow
except ImportError:
    mlflow = None
import numpy as np
import torch
import torch.nn as nn
from loguru import logger
from torch.utils.data import DataLoader, TensorDataset

from app.utils.preprocessor import FORECAST_INPUT_LEN, FORECAST_OUTPUT_LEN

# ── Model Constants ──────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 60
FORECAST_STEPS = 360

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "saved_models")
MODEL_PATH = os.path.join(MODEL_DIR, "lstm_forecaster.pt")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── Self-Attention Mechanism ──────────────────────────────────────────────────

class TemporalAttention(nn.Module):
    """
    Computes attention weights over the LSTM output sequence and produces
    a context vector as a weighted sum of all hidden states.
    """

    def __init__(self, hidden_dim: int):
        super().__init__()
        self.attention = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.Tanh(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def forward(self, lstm_output: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Parameters
        ----------
        lstm_output : torch.Tensor of shape (batch_size, seq_len, hidden_dim)

        Returns
        -------
        context : torch.Tensor of shape (batch_size, hidden_dim)
            Weighted sum of all hidden states across the sequence.
        weights : torch.Tensor of shape (batch_size, seq_len)
            Attention weight distribution across time steps (sums to 1.0).
        """
        # scores: (batch_size, seq_len, 1)
        scores = self.attention(lstm_output)
        # weights: (batch_size, seq_len, 1)
        weights = torch.softmax(scores, dim=1)
        # context: weighted sum of all hidden states -> (batch_size, hidden_dim)
        context = torch.sum(weights * lstm_output, dim=1)
        return context, weights.squeeze(-1)


# ── Network Architecture ─────────────────────────────────────────────────────

class BiLSTMWithAttention(nn.Module):
    """
    Bidirectional LSTM with Temporal Attention.

    Takes (batch, SEQUENCE_LENGTH, input_size) and produces
    (batch, output_steps, output_size).
    """

    def __init__(
        self,
        input_size: int = 2,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_steps: int = FORECAST_STEPS,
        output_size: int = 2,
        dropout: float = 0.3,
        bidirectional: bool = True,
    ):
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.output_steps = output_steps
        self.output_size = output_size
        self.bidirectional = bidirectional
        num_directions = 2 if bidirectional else 1
        lstm_hidden_dim = hidden_size * num_directions

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        self.attention = TemporalAttention(hidden_dim=lstm_hidden_dim)

        self.fc = nn.Sequential(
            nn.Linear(lstm_hidden_dim, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, output_steps * output_size),
        )

        self.last_attention_weights: torch.Tensor | None = None

    def forward(
        self,
        x: torch.Tensor,
        return_attention: bool = False,
    ) -> torch.Tensor | tuple[torch.Tensor, torch.Tensor]:
        # x: (batch, seq_len, input_size)
        lstm_out, _ = self.lstm(x)  # (batch, seq_len, hidden_dim)
        context, weights = self.attention(lstm_out)  # context: (batch, hidden_dim)
        self.last_attention_weights = weights

        out = self.fc(context)  # (batch, output_steps * output_size)
        out = out.view(-1, self.output_steps, self.output_size)

        if return_attention:
            return out, weights
        return out


# Backward compatibility alias
LSTMNetwork = BiLSTMWithAttention


# ── High-Level Forecaster Wrapper ────────────────────────────────────────────

class LSTMForecaster:
    """High-level train / predict / save / load interface around BiLSTMWithAttention."""

    def __init__(
        self,
        input_size: int = 2,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_steps: int = FORECAST_STEPS,
        dropout: float = 0.3,
    ):
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.output_steps = output_steps
        self.dropout = dropout
        self.sequence_length = SEQUENCE_LENGTH
        self.forecast_steps = output_steps

        self.model: BiLSTMWithAttention | None = None
        self._is_trained = False
        # Running stats for normalisation
        self._mean: np.ndarray | None = None
        self._std: np.ndarray | None = None
        self._last_attention_weights: np.ndarray | None = None

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
        Train the Bi-LSTM model on sliding-window tensors.

        Parameters
        ----------
        X : Tensor (N, sequence_length, 2)
        y : Tensor (N, output_steps, 2)
        """
        target_output_steps = y.shape[1] if (y is not None and hasattr(y, "shape")) else self.output_steps
        self.output_steps = target_output_steps
        self.forecast_steps = target_output_steps

        logger.info(
            f"Training Bi-LSTM with Attention — windows={X.shape[0]}, "
            f"input_len={X.shape[1]}, output_len={target_output_steps}, epochs={epochs}"
        )

        # Compute normalisation stats from training inputs
        flat = X.numpy().reshape(-1, self.input_size)
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

        self.model = BiLSTMWithAttention(
            input_size=self.input_size,
            hidden_size=self.hidden_size,
            num_layers=self.num_layers,
            output_steps=target_output_steps,
            output_size=y.shape[2] if len(y.shape) == 3 else 2,
            dropout=self.dropout,
            bidirectional=True,
        ).to(DEVICE)

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

        # Persist model
        self.save(MODEL_PATH)

        # MLflow logging (best-effort)
        try:
            mlflow.log_params({
                "lstm_architecture": "BiLSTM_with_TemporalAttention",
                "lstm_hidden_size": self.hidden_size,
                "lstm_num_layers": self.num_layers,
                "lstm_dropout": self.dropout,
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

    # ── Input Preprocessor ───────────────────────────────────────────────
    def _prepare_input(
        self,
        data: list[dict] | torch.Tensor | np.ndarray,
    ) -> tuple[torch.Tensor, str | None]:
        """Convert input data (list of metric dicts, tensor, or array) into a standard tensor."""
        inferred_timestamp = None

        if isinstance(data, list):
            # Find the latest timestamp if available
            for item in reversed(data):
                if isinstance(item, dict) and "timestamp" in item and item["timestamp"]:
                    inferred_timestamp = str(item["timestamp"])
                    break

            # Extract numeric series for cpu_pct and ram_pct
            points = []
            for item in data:
                if isinstance(item, dict):
                    points.append([
                        float(item.get("cpu_pct", 0.0)),
                        float(item.get("ram_pct", 0.0)),
                    ])
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    points.append([float(item[0]), float(item[1])])
            
            series = np.array(points, dtype=np.float32) if points else np.zeros((0, 2), dtype=np.float32)

            if len(series) < self.sequence_length:
                pad_len = self.sequence_length - len(series)
                if len(series) > 0:
                    pad = np.tile(series.mean(axis=0), (pad_len, 1))
                    series = np.concatenate([pad, series], axis=0)
                else:
                    series = np.zeros((self.sequence_length, 2), dtype=np.float32)
            else:
                series = series[-self.sequence_length:]

            X_tensor = torch.tensor(series, dtype=torch.float32).unsqueeze(0)
            return X_tensor, inferred_timestamp

        elif isinstance(data, np.ndarray):
            if data.ndim == 2:
                data = np.expand_dims(data, axis=0)
            return torch.tensor(data, dtype=torch.float32), None

        elif isinstance(data, torch.Tensor):
            if data.dim() == 2:
                data = data.unsqueeze(0)
            return data.float(), None

        else:
            raise TypeError(f"Unsupported input data type: {type(data)}")

    # ── Inference ────────────────────────────────────────────────────────
    def predict(
        self,
        X: list[dict] | torch.Tensor | np.ndarray,
        last_timestamp: str | None = None,
    ) -> dict:
        """
        Forecast CPU and RAM usage time-series.

        Parameters
        ----------
        X : list of metric dicts with 'cpu_pct' and 'ram_pct', or Tensor of shape (1, 60, 2)
        last_timestamp : ISO string of the last known data point (optional).

        Returns
        -------
        dict with keys:
            forecast            : list of {timestamp, cpu_pct, ram_pct}
            confidence_interval : float (overall range)
            confidence_intervals: dict with {cpu_pct, ram_pct, overall}
            peak_values         : dict with {cpu_pct, ram_pct}
            alert_flag          : bool (True if forecast breaches threshold)
            attention_weights   : list of attention weights across the 60 input steps
        """
        if not self._is_trained or self.model is None:
            raise RuntimeError("Model has not been trained yet")

        X_tensor, inferred_ts = self._prepare_input(X)
        if last_timestamp is None and inferred_ts is not None:
            last_timestamp = inferred_ts

        self.model.eval()
        with torch.no_grad():
            X_np = X_tensor.cpu().numpy()
            X_norm = (X_np - self._mean) / self._std
            X_t = torch.tensor(X_norm, dtype=torch.float32).to(DEVICE)
            pred_norm, attn_weights = self.model(X_t, return_attention=True)
            pred_np = pred_norm.cpu().numpy()
            self._last_attention_weights = attn_weights.cpu().numpy()[0]

        # Denormalise
        predictions = pred_np * self._std + self._mean
        predictions = predictions[0]  # shape: (output_steps, 2)

        # Clip to valid range [0, 100]%
        predictions[:, 0] = np.clip(predictions[:, 0], 0.0, 100.0)
        predictions[:, 1] = np.clip(predictions[:, 1], 0.0, 100.0)

        # Build timestamps (1-minute intervals from last known timestamp)
        if last_timestamp:
            try:
                base_time = datetime.fromisoformat(last_timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                base_time = datetime.now(timezone.utc)
        else:
            base_time = datetime.now(timezone.utc)

        forecast_points = []
        for i in range(len(predictions)):
            ts = base_time + timedelta(minutes=i + 1)
            forecast_points.append({
                "timestamp": ts.isoformat(),
                "cpu_pct": round(float(predictions[i, 0]), 2),
                "ram_pct": round(float(predictions[i, 1]), 2),
            })

        # Confidence intervals based on variance
        cpu_std = float(np.std(predictions[:, 0]))
        ram_std = float(np.std(predictions[:, 1]))
        pred_std = float(np.std(predictions))
        confidence_interval = round(min(pred_std * 1.96, 25.0), 2)
        confidence_intervals = {
            "cpu_pct": round(min(cpu_std * 1.96, 25.0), 2),
            "ram_pct": round(min(ram_std * 1.96, 25.0), 2),
            "overall": confidence_interval,
        }

        # Peak forecast values
        peak_cpu = round(float(np.max(predictions[:, 0])), 2)
        peak_ram = round(float(np.max(predictions[:, 1])), 2)
        peak_values = {
            "cpu_pct": peak_cpu,
            "ram_pct": peak_ram,
        }

        # Alert flag: alert if forecasted peak exceeds 85.0%
        alert_flag = bool(peak_cpu >= 85.0 or peak_ram >= 85.0)

        attention_weights_list = [round(float(w), 4) for w in self._last_attention_weights]

        return {
            "forecast": forecast_points,
            "confidence_interval": confidence_interval,
            "confidence_intervals": confidence_intervals,
            "peak_values": peak_values,
            "alert_flag": alert_flag,
            "attention_weights": attention_weights_list,
        }

    # ── Attention Weights Accessor ───────────────────────────────────────
    def get_attention_weights(
        self,
        X: list[dict] | torch.Tensor | np.ndarray | None = None,
    ) -> list[float]:
        """
        Returns which time steps the model focused on.

        If X is provided, computes attention weights for the given input.
        Otherwise, returns the attention weights from the most recent predict() call.
        """
        if X is not None:
            if not self._is_trained or self.model is None:
                raise RuntimeError("Model has not been trained yet")
            X_tensor, _ = self._prepare_input(X)
            self.model.eval()
            with torch.no_grad():
                X_np = X_tensor.cpu().numpy()
                X_norm = (X_np - self._mean) / self._std
                X_t = torch.tensor(X_norm, dtype=torch.float32).to(DEVICE)
                _, weights = self.model(X_t, return_attention=True)
                self._last_attention_weights = weights.cpu().numpy()[0]

        if self._last_attention_weights is None:
            return []

        return [round(float(w), 4) for w in self._last_attention_weights]

    # ── Persistence Helpers ──────────────────────────────────────────────
    def save(self, path: str = MODEL_PATH) -> str:
        """Save model weights and metadata to disk."""
        if not self._is_trained or self.model is None:
            raise RuntimeError("Cannot save an untrained model")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        torch.save({
            "model_state": self.model.state_dict(),
            "mean": self._mean,
            "std": self._std,
            "input_size": self.input_size,
            "hidden_size": self.hidden_size,
            "num_layers": self.num_layers,
            "output_steps": self.output_steps,
            "forecast_steps": self.forecast_steps,
            "dropout": self.dropout,
        }, path)
        logger.info(f"Bi-LSTM forecaster saved to {path}")
        return path

    def load(self, path: str = MODEL_PATH) -> bool:
        """Load a previously saved model. Returns True on success."""
        if os.path.exists(path):
            try:
                checkpoint = torch.load(path, map_location=DEVICE, weights_only=False)
                state_dict = checkpoint["model_state"]

                output_steps = checkpoint.get("output_steps", checkpoint.get("forecast_steps", self.output_steps))
                if "fc.3.weight" in state_dict:
                    output_steps = state_dict["fc.3.weight"].shape[0] // 2
                elif "fc.3.bias" in state_dict:
                    output_steps = state_dict["fc.3.bias"].shape[0] // 2

                self.output_steps = output_steps
                self.forecast_steps = output_steps
                self.hidden_size = checkpoint.get("hidden_size", self.hidden_size)
                self.num_layers = checkpoint.get("num_layers", self.num_layers)
                self.dropout = checkpoint.get("dropout", self.dropout)

                self.model = BiLSTMWithAttention(
                    input_size=self.input_size,
                    hidden_size=self.hidden_size,
                    num_layers=self.num_layers,
                    output_steps=self.output_steps,
                    output_size=2,
                    dropout=self.dropout,
                    bidirectional=True,
                ).to(DEVICE)

                self.model.load_state_dict(state_dict)
                self._mean = checkpoint["mean"]
                self._std = checkpoint["std"]
                self._is_trained = True
                logger.info(f"Bi-LSTM forecaster loaded from disk ({path})")
                return True
            except Exception as e:
                logger.error(f"Failed to load saved model from {path}: {e}")
                return False

        logger.warning(f"No saved LSTM forecaster found at {path}")
        return False

    @property
    def is_trained(self) -> bool:
        return self._is_trained
