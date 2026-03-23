import hashlib, secrets
from datetime import datetime, timedelta
from jose import jwt
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from database import SessionLocal
from models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return salt + hashlib.sha256((salt + password).encode()).hexdigest()

def verify_password(plain: str, hashed: str) -> bool:
    salt = hashed[:32]
    return hashlib.sha256((salt + plain).encode()).hexdigest() == hashed[32:]

def create_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(days=7)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/register")
def register(username: str = Form(), email: str = Form(), password: str = Form(), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    user = User(username=username, email=email, password=hash_password(password))
    db.add(user)
    db.commit()
    return {"message": "Registered successfully"}

@router.post("/login")
def login(username: str = Form(), password: str = Form(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": create_token(username), "token_type": "bearer"}