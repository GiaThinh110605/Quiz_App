from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import hashlib
import secrets
from sqlalchemy.orm import Session
from models.user import User, UserRole
from schemas.auth import UserCreate, UserLogin
from fastapi import HTTPException, status

SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password using SHA256 hash with salt."""
    salt = hashed_password[:32]
    stored_hash = hashed_password[32:]
    pwd_hash = hashlib.sha256((salt + plain_password).encode()).hexdigest()
    return pwd_hash == stored_hash

def get_password_hash(password: str) -> str:
    """Hash password using SHA256 with random salt."""
    salt = secrets.token_hex(16)  # 32 chars
    pwd_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return salt + pwd_hash

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, expire

def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        return username
    except JWTError:
        return None

def register_user(db: Session, user_data: UserCreate):
    # Check if user exists
    existing_user = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )
    
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    return user

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def require_role(user: User, required_role: UserRole):
    if user.role == UserRole.ADMIN:
        return True
    if user.role == required_role:
        return True
    return False