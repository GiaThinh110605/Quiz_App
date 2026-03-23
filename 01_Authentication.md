# Feature: Authentication & Authorization (Phân quyền và Bảo mật)

## Overview
Hệ thống xác thực và phân quyền cho Quiz App, bao gồm đăng nhập, đăng ký, JWT token và role-based access control.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/database.py` (BẮT BUỘC - File này bị thiếu)
**Nội dung:**
```python
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database URL - SQLite for development
SQLALCHEMY_DATABASE_URL = "sqlite:///./quiz_app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

#### 2. `/backend/models/user.py`
**Nội dung:**
```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.sql import func
from database import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    LIBRARIAN = "librarian"
    USER = "user"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
```

#### 2. `/backend/schemas/auth.py`
**Nội dung:**
```python
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from models.user import UserRole

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole = UserRole.USER

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[datetime] = None
```

#### 3. `/backend/services/auth_service.py`
**Nội dung:**
```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from models.user import User, UserRole
from schemas.auth import UserCreate, UserLogin
from fastapi import HTTPException, status

SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

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
```

#### 4. `/backend/routers/auth.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List

from database import get_db
from models.user import User, UserRole
from schemas.auth import UserCreate, UserLogin, UserResponse, Token
from services.auth_service import (
    register_user, authenticate_user, create_access_token, 
    verify_token, get_user_by_username, require_role, ACCESS_TOKEN_EXPIRE_MINUTES
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    username = verify_token(token)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_user_by_username(db, username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user

def require_admin(current_user: User = Depends(get_current_active_user)):
    if not require_role(current_user, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

def require_librarian(current_user: User = Depends(get_current_active_user)):
    if not require_role(current_user, UserRole.LIBRARIAN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Librarian access required"
        )
    return current_user

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    user = register_user(db, user_data)
    return user

@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, user_data.username, user_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token, expire = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user
    }

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.put("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = False
    db.commit()
    return {"message": "User deactivated successfully"}

@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    new_role: UserRole,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = new_role
    db.commit()
    return {"message": f"User role updated to {new_role}"}
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 5. `/frontend/src/context/AuthContext.js`
**Nội dung:**
```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            verifyToken(token);
        } else {
            setLoading(false);
        }
    }, [token]);

    const verifyToken = async (token) => {
        try {
            const response = await fetch('/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            } else {
                logout();
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (credentials) => {
        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            
            if (response.ok) {
                const data = await response.json();
                setToken(data.access_token);
                localStorage.setItem('token', data.access_token);
                setUser(data.user);
                return { success: true, user: data.user };
            } else {
                const error = await response.json();
                return { success: false, error: error.detail };
            }
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    };

    const register = async (userData) => {
        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                return { success: true };
            } else {
                const error = await response.json();
                return { success: false, error: error.detail };
            }
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
    };

    const value = {
        user,
        token,
        login,
        register,
        logout,
        loading,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isLibrarian: user?.role === 'librarian' || user?.role === 'admin'
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
```

#### 6. `/frontend/src/components/auth/ProtectedRoute.js`
**Nội dung:**
```javascript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
    const { user, isAuthenticated, loading } = useAuth();

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requiredRole) {
        const hasPermission = user.role === 'admin' || user.role === requiredRole;
        if (!hasPermission) {
            return <Navigate to="/unauthorized" replace />;
        }
    }

    return children;
};

export default ProtectedRoute;
```

#### 7. `/frontend/src/components/auth/LoginForm.jsx` (CẬP NHẬT GIAO DIỆN ĐẸP)
**Nội dung:**
```javascript
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const LoginForm = () => {
    const navigate = useNavigate();
    const [credentials, setCredentials] = useState({
        username: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const result = await login(credentials);
        if (result.success) {
            navigate('/quiz');
        } else {
            setError(result.error || 'Đăng nhập thất bại');
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Chao mừng trở lại!</h2>
                <p className="auth-subtitle">Đăng nhập để tiếp tục làm bài trắc nghiệm</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Tên đăng nhập</label>
                        <input
                            type="text"
                            placeholder="Nhập tên đăng nhập"
                            value={credentials.username}
                            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Mật khẩu</label>
                        <input
                            type="password"
                            placeholder="Nhập mật khẩu"
                            value={credentials.password}
                            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                            required
                        />
                    </div>

                    <button type="submit" className="btn-submit" disabled={loading}>
                        {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                </form>

                <div className="auth-footer">
                    Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
                </div>
            </div>
        </div>
    );
};

export default LoginForm;
```

#### 8. `/frontend/src/components/auth/RegisterForm.jsx` (CẬP NHẬT GIAO DIỆN ĐẸP)
**Nội dung:**
```javascript
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const RegisterForm = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            setError('Mật khẩu không khớp');
            setLoading(false);
            return;
        }

        const result = await register({
            username: formData.username,
            email: formData.email,
            password: formData.password
        });

        if (result.success) {
            setSuccess('Đăng ký thành công! Đang chuyển đến đăng nhập...');
            setTimeout(() => navigate('/login'), 2000);
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Tạo tài khoản mới!</h2>
                <p className="auth-subtitle">Đăng ký để bắt đầu làm bài trắc nghiệm</p>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Tên đăng nhập</label>
                        <input
                            type="text"
                            placeholder="Nhập tên đăng nhập"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            placeholder="Nhập email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Mật khẩu</label>
                        <input
                            type="password"
                            placeholder="Nhập mật khẩu"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Xác nhận mật khẩu</label>
                        <input
                            type="password"
                            placeholder="Nhập lại mật khẩu"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            required
                        />
                    </div>

                    <button type="submit" className="btn-submit" disabled={loading}>
                        {loading ? 'Đang đăng ký...' : 'Đăng ký'}
                    </button>
                </form>

                <div className="auth-footer">
                    Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link>
                </div>
            </div>
        </div>
    );
};

export default RegisterForm;
```

#### 9. `/frontend/src/services/authService.js`
**Nội dung:**
```javascript
const API_URL = '/auth';

const authService = {
    login: async (credentials) => {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        return response.json();
    },

    register: async (userData) => {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        return response.json();
    },

    getCurrentUser: async (token) => {
        const response = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    getUsers: async (token) => {
        const response = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    }
};

export default authService;
```

#### 10. `/frontend/src/styles/main.css` (GIAO DIỆN ĐẸP)
**Nội dung:**
```css
/* Modern Quiz App Styles */
:root {
  --primary-color: #6366f1;
  --primary-hover: #4f46e5;
  --secondary-color: #8b5cf6;
  --success-color: #10b981;
  --error-color: #ef4444;
  --warning-color: #f59e0b;
  --bg-color: #f3f4f6;
  --card-bg: #ffffff;
  --text-primary: #1f2937;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  --radius: 12px;
  --radius-sm: 8px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  color: var(--text-primary);
}

/* Navbar */
.navbar {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: var(--shadow);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-brand a {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
  text-decoration: none;
}

.nav-links { display: flex; gap: 2rem; }
.nav-links a {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s;
}
.nav-links a:hover { color: var(--primary-color); }

.nav-auth { display: flex; align-items: center; gap: 1rem; }
.nav-auth span { color: var(--text-secondary); font-weight: 500; }

/* Buttons */
.btn-primary {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  text-decoration: none;
  display: inline-block;
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
}

.btn-login, .btn-register, .btn-logout {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.btn-login {
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  background: transparent;
}

.btn-register {
  background: var(--primary-color);
  color: white;
  border: none;
}

.btn-logout {
  background: var(--error-color);
  color: white;
  border: none;
}

/* Main Content */
.main-content {
  min-height: calc(100vh - 70px);
  padding: 2rem;
}

/* Auth Container */
.auth-container {
  min-height: calc(100vh - 70px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.auth-card {
  background: var(--card-bg);
  padding: 2.5rem;
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 420px;
  animation: slideUp 0.5s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.auth-card h2 {
  text-align: center;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-size: 1.75rem;
}

.auth-subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 2rem;
  font-size: 0.875rem;
}

/* Form Styles */
.form-group { margin-bottom: 1.25rem; }
.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.875rem;
}
.form-group input {
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: #f9fafb;
}
.form-group input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  background: white;
}

.btn-submit {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  margin-top: 1rem;
}
.btn-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
}
.btn-submit:disabled { opacity: 0.7; cursor: not-allowed; }

/* Messages */
.error-message {
  background: #fee2e2;
  color: var(--error-color);
  padding: 0.75rem 1rem;
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.success-message {
  background: #d1fae5;
  color: var(--success-color);
  padding: 0.75rem 1rem;
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

/* Auth Footer */
.auth-footer {
  text-align: center;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.auth-footer a {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
}

/* Home Page */
.home-page {
  text-align: center;
  padding: 4rem 2rem;
  max-width: 800px;
  margin: 0 auto;
}
.home-page h1 {
  font-size: 3rem;
  font-weight: 800;
  color: white;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
}
.home-page p {
  font-size: 1.25rem;
  color: rgba(255,255,255,0.9);
  margin-bottom: 2rem;
}

/* Quiz Styles */
.quiz-wrapper { max-width: 800px; margin: 0 auto; }

.quiz-header {
  background: var(--card-bg);
  padding: 1.5rem 2rem;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  margin-bottom: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.quiz-title { font-size: 1.5rem; font-weight: 700; }
.quiz-progress { display: flex; align-items: center; gap: 1rem; }

.progress-bar {
  width: 150px;
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
  transition: width 0.3s ease;
}

.question-container {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 2.5rem;
  margin-bottom: 2rem;
}
.question-text {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 2rem;
  line-height: 1.6;
}
.options-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.option-button {
  padding: 1rem 1.5rem;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: white;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.option-button:hover {
  border-color: var(--primary-color);
  background: #f5f3ff;
}
.option-button.selected {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
}

/* Quiz Navigation */
.quiz-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
}
.nav-button {
  padding: 0.875rem 2rem;
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  font-size: 1rem;
}
.nav-button.prev {
  background: white;
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}
.nav-button.next, .nav-button.submit {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
}

/* Question Dots */
.question-dots {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
  flex-wrap: wrap;
}
.question-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.question-dot.current {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}
.question-dot.answered {
  background: var(--success-color);
  border-color: var(--success-color);
  color: white;
}

/* Results */
.results-container { max-width: 800px; margin: 0 auto; }
.score-card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  padding: 3rem;
  text-align: center;
  margin-bottom: 2rem;
}
.score-display { margin-bottom: 1rem; }
.score-display h2 { font-size: 3rem; font-weight: 800; }
.score-display.good { color: var(--success-color); }
.score-display.medium { color: var(--warning-color); }
.score-display.poor { color: var(--error-color); }

.result-icon { font-size: 4rem; margin-bottom: 1rem; }

/* Start Quiz */
.start-quiz-container {
  min-height: calc(100vh - 70px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.start-quiz-card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  padding: 3rem;
  text-align: center;
  max-width: 500px;
  width: 100%;
}
.quiz-info {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-bottom: 2rem;
}
.info-item .value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
}
.info-item .label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Loading */
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 2rem auto;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Responsive */
@media (max-width: 768px) {
  .navbar { padding: 1rem; flex-wrap: wrap; gap: 1rem; }
  .nav-links { gap: 1rem; font-size: 0.875rem; }
  .main-content { padding: 1rem; }
  .home-page h1 { font-size: 2rem; }
  .question-container { padding: 1.5rem; }
  .quiz-header { flex-direction: column; gap: 1rem; text-align: center; }
  .quiz-navigation { flex-direction: column; gap: 1rem; }
  .nav-button { width: 100%; }
}
```

## Dependencies Required

### Backend
```
python-jose[cryptography]==3.3.0
python-multipart==0.0.6
```
*Note: Không cần `passlib[bcrypt]` nữa, đã chuyển sang dùng `hashlib` tích hợp sẵn*

### Frontend
```bash
npm install react-router-dom
```

#### 11. `/frontend/src/pages/QuizPage.jsx` (GIAO DIỆN ĐẸP)
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';

const QuizPage = () => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchQuestions(); }, []);

  const fetchQuestions = async () => {
    try {
      const response = await fetch('/questions');
      const data = await response.json();
      setQuestions(data);
    } catch (error) { console.error('Error:', error); }
  };

  const startQuiz = () => {
    setQuizStarted(true);
    setCurrentQuestion(0);
    setAnswers({});
    setShowResults(false);
    setResults(null);
  };

  const handleAnswerSelect = (questionId, selectedAnswer) => {
    setAnswers(prev => ({ ...prev, [questionId]: selectedAnswer }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const submission = {
        answers: Object.entries(answers).map(([questionId, selectedAnswer]) => ({
          question_id: parseInt(questionId),
          selected_answer: selectedAnswer
        }))
      };
      const response = await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      const result = await response.json();
      setResults(result);
      setShowResults(true);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) setCurrentQuestion(currentQuestion + 1);
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) setCurrentQuestion(currentQuestion - 1);
  };

  const getScoreClass = (score) => {
    if (score >= 80) return 'good';
    if (score >= 60) return 'medium';
    return 'poor';
  };

  const getScoreIcon = (score) => {
    if (score >= 80) return '🎉';
    if (score >= 60) return '👍';
    return '💪';
  };

  // Start Quiz Screen
  if (!quizStarted) {
    return (
      <div className="start-quiz-container">
        <div className="start-quiz-card">
          <h1>Ứng dụng Trắc nghiệm</h1>
          <p>Chào mừng bạn đến với bài trắc nghiệm kiến thức lập trình web!</p>
          <div className="quiz-info">
            <div className="info-item">
              <div className="value">{questions.length}</div>
              <div className="label">Câu hỏi</div>
            </div>
            <div className="info-item">
              <div className="value">15</div>
              <div className="label">Phút</div>
            </div>
            <div className="info-item">
              <div className="value">100</div>
              <div className="label">Điểm</div>
            </div>
          </div>
          <button className="btn-primary" onClick={startQuiz}>Bắt đầu làm bài</button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults && results) {
    const scoreClass = getScoreClass(results.score);
    const scoreIcon = getScoreIcon(results.score);
    return (
      <div className="main-content">
        <div className="results-container">
          <div className="score-card">
            <div className="result-icon">{scoreIcon}</div>
            <div className={`score-display ${scoreClass}`}>
              <h2>{results.score.toFixed(0)}/100</h2>
              <p>Số câu đúng: {results.correct_answers}/{results.total_questions}</p>
            </div>
            <button className="btn-primary" onClick={startQuiz}>Làm lại bài thi</button>
          </div>
          <div className="result-details">
            <h3>Chi tiết kết quả</h3>
            {results.results.map((result) => (
              <div key={result.question_id} className={`result-item ${result.is_correct ? 'correct' : 'incorrect'}`}>
                <div className="result-question">Câu {result.question_id}: {result.question}</div>
                <div className={`result-answer user-${result.is_correct ? 'correct' : 'incorrect'}`}>
                  Đáp án của bạn: {result.user_answer || '(Không trả lời)'}
                </div>
                {!result.is_correct && (
                  <div className="result-answer correct-answer">Đáp án đúng: {result.correct_answer}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (questions.length === 0) {
    return (
      <div className="main-content">
        <div className="spinner"></div>
        <p style={{ textAlign: 'center', color: 'white' }}>Đang tải câu hỏi...</p>
      </div>
    );
  }

  // Quiz Question Screen
  const question = questions[currentQuestion];
  const selectedAnswer = answers[question.id];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <div className="main-content">
      <div className="quiz-wrapper">
        <div className="quiz-header">
          <div className="quiz-title">Bài trắc nghiệm</div>
          <div className="quiz-progress">
            <span className="progress-text">Câu {currentQuestion + 1}/{questions.length}</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
        <div className="question-container">
          <div className="question-text">{question.question}</div>
          <div className="options-container">
            {question.options.map((option, index) => (
              <button
                key={index}
                className={`option-button ${selectedAnswer === option ? 'selected' : ''}`}
                onClick={() => handleAnswerSelect(question.id, option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="question-dots">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              className={`question-dot ${idx === currentQuestion ? 'current' : ''} ${answers[q.id] ? 'answered' : ''}`}
              onClick={() => setCurrentQuestion(idx)}
            >
              {idx + 1}
            </button>
          ))}
        </div>
        <div className="quiz-navigation">
          {currentQuestion > 0 ? (
            <button className="nav-button prev" onClick={prevQuestion}>← Câu trước</button>
          ) : <div></div>}
          {currentQuestion < questions.length - 1 ? (
            <button className="nav-button next" onClick={nextQuestion}>Câu tiếp theo →</button>
          ) : (
            <button className="nav-button submit" onClick={handleSubmit}
              disabled={loading || Object.keys(answers).length === 0}>
              {loading ? 'Đang nộp...' : 'Nộp bài ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizPage;
```

## CẬP NHẬT MAIN.PY (BẮT BUỘC)

Sau khi tạo các file trên, bạn PHẢI cập nhật `/backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base  # THÊM DÒNG NÀY
from routers import auth          # THÊM DÒNG NÀY

# Create database tables
Base.metadata.create_all(bind=engine)  # THÊM DÒNG NÀY

app = FastAPI(title="Quiz App API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth router
app.include_router(auth.router)  # THÊM DÒNG NÀY

# ... rest of your code (questions, submit endpoints)
```

## CẬP NHẬT FRONTEND INDEX.JS (BẮT BUỘC)

Cập nhật `/frontend/src/index.js`:

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';           // THÊM
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';       // THÊM

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>                                         {/* THÊM */}
      <AuthProvider>                                        {/* THÊM */}
        <App />
      </AuthProvider>                                       {/* THÊM */}
    </BrowserRouter>                                       {/* THÊM */}
  </React.StrictMode>
);
```

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | /auth/register | Register new user | Public |
| POST | /auth/login | User login | Public |
| GET | /auth/me | Get current user | Authenticated |
| GET | /auth/users | List all users | Admin only |
| PUT | /auth/users/{id}/deactivate | Deactivate user | Admin only |
| PUT | /auth/users/{id}/role | Update user role | Admin only |

## Testing Checklist
- [ ] Đăng ký user mới
- [ ] Đăng nhập với credentials đúng
- [ ] Đăng nhập với credentials sai
- [ ] JWT token validation
- [ ] Role-based access control
- [ ] Token expiration handling
- [ ] Protected routes
- [ ] User deactivation
- [ ] Role assignment
