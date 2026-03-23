
---

## 🚀 Thêm Authentication (Đăng nhập/Đăng ký)

### 1. Backend Setup

**Cập nhật `requirements.txt`:**
```txt
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
sqlalchemy==2.0.23
python-jose[cryptography]==3.3.0
python-multipart==0.0.6
```

**Tạo `database.py`:**
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "sqlite:///./quiz_app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

Base.metadata.create_all(bind=engine)
```

**Tạo `models/user.py`:**
```python
from sqlalchemy import Column, Integer, String
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
```

**Tạo `routers/auth.py`:**
```python
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
```

**Cập nhật `main.py`:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from routers import auth

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)

# ... rest of your code
```

### 2. Frontend Setup

**Cài đặt dependencies:**
```bash
cd frontend
npm install react-router-dom
```

**Tạo `context/AuthContext.jsx`:**
```javascript
import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = async (credentials) => {
    const params = new URLSearchParams(credentials);
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('token', data.access_token);
      setUser({ username: credentials.username });
      return { success: true };
    }
    return { success: false, error: data.detail || 'Login failed' };
  };

  const register = async (userData) => {
    const params = new URLSearchParams(userData);
    const res = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    if (res.ok) return { success: true };
    const data = await res.json();
    return { success: false, error: data.detail || 'Registration failed' };
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**Tạo `components/LoginForm.jsx`:**
```javascript
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginForm() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(form);
    if (result.success) navigate('/quiz');
    else setError(typeof result.error === 'string' ? result.error : 'Login failed');
  };

  return (
    <div className="auth-container">
      <h2>Đăng nhập</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input placeholder="Username" value={form.username}
          onChange={e => setForm({...form, username: e.target.value})} required />
        <br />
        <input type="password" placeholder="Password" value={form.password}
          onChange={e => setForm({...form, password: e.target.value})} required />
        <br />
        <br />
        <button type="submit">Đăng nhập</button>
      </form>
      <p>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
    </div>
  );
}
```

**Tạo `components/RegisterForm.jsx`:**
```javascript
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function RegisterForm() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(form);
    if (result.success) navigate('/login');
    else setError(typeof result.error === 'string' ? result.error : 'Registration failed');
  };

  return (
    <div className="auth-container">
      <h2>Đăng ký</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input placeholder="Username" value={form.username}
          onChange={e => setForm({...form, username: e.target.value})} required />
        <input type="email" placeholder="Email" value={form.email}
          onChange={e => setForm({...form, email: e.target.value})} required />
        <input type="password" placeholder="Password" value={form.password}
          onChange={e => setForm({...form, password: e.target.value})} required />
        <button type="submit">Đăng ký</button>
      </form>
      <p>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
    </div>
  );
}
```

**Cập nhật `index.js`:**
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

**Cập nhật `App.js` để thêm routes:**
```javascript
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
// ... your existing imports

function App() {
  const { user } = useAuth();
  
  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/quiz" /> : <LoginForm />} />
        <Route path="/register" element={user ? <Navigate to="/quiz" /> : <RegisterForm />} />
        {/* ... your existing routes */}
      </Routes>
    </div>
  );
}
```

### 3. Chạy lại
```bash
# Backend
cd backend
pip install -r requirements.txt
python main.py

# Frontend  
cd frontend
npm install react-router-dom
npm start
```

### 4. CSS Styling (Tùy chọn)

Thêm vào `frontend/src/index.css` để style đẹp hơn:

```css
form input {
  width: 350px;
  height: 50px;
  margin-top: 20px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 16px;
}

button {
  color: white;
  background-color: #007bff;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  margin-top: 10px;
}

button:hover {
  background-color: #0056b3;
}

.auth-container {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background-color: #f9f9f9;
}

.auth-container h2 {
  text-align: center;
  margin-bottom: 20px;
  color: #333;
}

.error {
  color: red;
  text-align: center;
  margin-bottom: 10px;
}

.auth-container p {
  text-align: center;
  margin-top: 15px;
}

.auth-container a {
  color: #007bff;
  text-decoration: none;
}

.auth-container a:hover {
  text-decoration: underline;
}
```
