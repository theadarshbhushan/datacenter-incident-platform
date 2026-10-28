from app.models.account import ACCOUNT_MODELS
from app.models.monitoring import MONITORING_MODELS
from app.models.user import User

ALL_MODELS = [User, *ACCOUNT_MODELS, *MONITORING_MODELS]

__all__ = ["ALL_MODELS"]
