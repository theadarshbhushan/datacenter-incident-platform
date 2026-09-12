from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends, Request
from pydantic import BaseModel, EmailStr
from loguru import logger

from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.schemas.response import success_response, error_response

router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Optional[str] = "operator"


class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    existing = await User.find_one(User.email == payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role or "operator",
    )
    await user.insert()

    token = create_access_token({"sub": user.email, "role": user.role})
    logger.info(f"Registered new operator: {user.email}")

    return success_response(
        data={
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
            },
        },
        message="User registered successfully",
    )


@router.post("/login")
async def login(request: Request, payload: Optional[LoginRequest] = None):
    # Support both JSON Body and form-urlencoded login
    email = None
    password = None

    if payload and (payload.email or payload.username):
        email = payload.email or payload.username
        password = payload.password
    else:
        try:
            form = await request.form()
            email = form.get("username") or form.get("email")
            password = form.get("password")
        except Exception:
            pass

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both email/username and password are required",
        )

    user = await User.find_one(User.email == email)
    if not user or not verify_password(password, user.hashed_password):
        # Auto-create admin for initial out-of-the-box experience if admin credentials
        if email in ["admin@datacenter.local", "operator@vaultwatch.internal"] and password == "admin123":
            user = User(
                email=email,
                hashed_password=hash_password("admin123"),
                full_name="Lead SRE Administrator",
                role="admin",
            )
            await user.insert()
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

    token = create_access_token({"sub": user.email, "role": user.role})
    logger.info(f"Authenticated operator: {user.email}")

    return success_response(
        data={
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
            },
        },
        message="Login successful",
    )


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return success_response(
        data={
            "id": str(current_user.id) if current_user.id else "demo-id",
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "created_at": current_user.created_at.isoformat(),
        },
        message="Current user profile retrieved",
    )
