# Feature: User Management (Quản lý người dùng)

## Overview
Hệ thống quản lý người dùng cho Quiz App bao gồm CRUD operations, profile management, và user administration.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/routers/users.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
from pathlib import Path

from database import get_db
from models.user import User
from schemas.user import (
    UserProfile, UserProfileUpdate, UserList, UserFilter, 
    UserAdminUpdate, UserBulkAction
)
from services.user_service import UserService
from routers.auth import get_current_active_user, require_admin, require_librarian

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/profile/me", response_model=UserProfile)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user's profile."""
    return UserService.get_user_profile(current_user)

@router.put("/profile/me", response_model=UserProfile)
async def update_my_profile(
    profile_update: UserProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user's profile."""
    updated_user = UserService.update_user_profile(db, current_user.id, profile_update)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    return updated_user

@router.post("/profile/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload user avatar."""
    # Validate file
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif'}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Check file size (max 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    
    # Save file
    avatar_dir = Path("uploads/avatars")
    avatar_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"user_{current_user.id}{file_ext}"
    file_path = avatar_dir / filename
    
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # Update user record
    avatar_url = f"/uploads/avatars/{filename}"
    UserService.update_user_avatar(db, current_user.id, avatar_url)
    
    return {"avatar_url": avatar_url}

@router.delete("/profile/me/avatar")
async def delete_avatar(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete user avatar."""
    # Delete file if exists
    if current_user.avatar_url:
        file_path = Path(current_user.avatar_url.replace("/uploads/", "uploads/"))
        if file_path.exists():
            file_path.unlink()
    
    UserService.update_user_avatar(db, current_user.id, None)
    return {"message": "Avatar deleted"}

@router.get("/profile/{user_id}", response_model=UserProfile)
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get public profile of any user."""
    user = UserService.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Hide sensitive info for non-admin users viewing other profiles
    if current_user.id != user_id and current_user.role not in ["admin", "librarian"]:
        # Return limited public profile
        return UserService.get_public_profile(user)
    
    return UserService.get_user_profile(user)

@router.get("/", response_model=UserList)
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    filter_params: UserFilter = Depends(),
    sort_by: str = Query("created_at", regex="^(username|email|created_at|role|last_login)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    current_user: User = Depends(require_librarian),
    db: Session = Depends(get_db)
):
    """List all users with filtering and sorting."""
    users, total = UserService.list_users(
        db, skip=skip, limit=limit, 
        filters=filter_params,
        sort_by=sort_by, sort_order=sort_order
    )
    
    return {
        "users": users,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/search")
async def search_users(
    query: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Search users by username or email."""
    users = UserService.search_users(db, query, limit)
    return users

@router.put("/{user_id}", response_model=UserProfile)
async def update_user(
    user_id: int,
    user_update: UserAdminUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update any user (admin only)."""
    updated_user = UserService.admin_update_user(db, user_id, user_update)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    return updated_user

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    soft_delete: bool = Query(True),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete user (admin only)."""
    # Prevent self-deletion
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    success = UserService.delete_user(db, user_id, soft_delete)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}

@router.post("/bulk-action")
async def bulk_user_action(
    action: UserBulkAction,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Perform bulk action on users (admin only)."""
    results = UserService.bulk_action(db, action)
    return results

@router.get("/export")
async def export_users(
    format: str = Query("csv", regex="^(csv|json|xlsx)$"),
    filter_params: UserFilter = Depends(),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Export user list (admin only)."""
    file_path = UserService.export_users(db, format, filter_params)
    return FileResponse(file_path)

@router.get("/{user_id}/activity")
async def get_user_activity(
    user_id: int,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user activity history."""
    # Users can only view their own activity unless admin
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    activity = UserService.get_user_activity(db, user_id, days)
    return activity
```

#### 2. `/backend/services/user_service.py`
**Nội dung:**
```python
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import List, Optional, Tuple
from datetime import datetime, timedelta
import pandas as pd
from pathlib import Path

from models.user import User
from models.statistics import UserActivity
from schemas.user import UserProfile, UserProfileUpdate, UserFilter, UserAdminUpdate, UserBulkAction

class UserService:
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()
    
    @staticmethod
    def get_user_profile(user: User) -> UserProfile:
        """Convert User model to UserProfile schema."""
        return UserProfile(
            id=user.id,
            username=user.username,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            full_name=f"{user.first_name or ''} {user.last_name or ''}".strip(),
            avatar_url=user.avatar_url,
            phone=user.phone,
            birth_date=user.birth_date,
            gender=user.gender,
            bio=user.bio,
            address=user.address,
            city=user.city,
            country=user.country,
            role=user.role,
            is_active=user.is_active,
            email_verified=user.email_verified,
            created_at=user.created_at,
            last_login=user.last_login,
            preferences=user.preferences or {},
            settings=user.settings or {}
        )
    
    @staticmethod
    def get_public_profile(user: User) -> UserProfile:
        """Return limited public profile."""
        return UserProfile(
            id=user.id,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            full_name=f"{user.first_name or ''} {user.last_name or ''}".strip(),
            avatar_url=user.avatar_url,
            bio=user.bio,
            role=user.role,
            created_at=user.created_at
        )
    
    @staticmethod
    def update_user_profile(db: Session, user_id: int, update_data: UserProfileUpdate) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        
        # Update allowed fields
        update_dict = update_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            if hasattr(user, field):
                setattr(user, field, value)
        
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def update_user_avatar(db: Session, user_id: int, avatar_url: Optional[str]) -> bool:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return False
        
        user.avatar_url = avatar_url
        user.updated_at = datetime.utcnow()
        db.commit()
        return True
    
    @staticmethod
    def list_users(
        db: Session, 
        skip: int = 0, 
        limit: int = 20,
        filters: Optional[UserFilter] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[User], int]:
        query = db.query(User)
        
        # Apply filters
        if filters:
            if filters.role:
                query = query.filter(User.role == filters.role)
            if filters.is_active is not None:
                query = query.filter(User.is_active == filters.is_active)
            if filters.email_verified is not None:
                query = query.filter(User.email_verified == filters.email_verified)
            if filters.created_after:
                query = query.filter(User.created_at >= filters.created_after)
            if filters.created_before:
                query = query.filter(User.created_at <= filters.created_before)
            if filters.search:
                search_term = f"%{filters.search}%"
                query = query.filter(
                    or_(
                        User.username.ilike(search_term),
                        User.email.ilike(search_term),
                        User.first_name.ilike(search_term),
                        User.last_name.ilike(search_term)
                    )
                )
        
        # Get total count
        total = query.count()
        
        # Apply sorting
        sort_column = getattr(User, sort_by, User.created_at)
        if sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())
        
        # Apply pagination
        users = query.offset(skip).limit(limit).all()
        return users, total
    
    @staticmethod
    def search_users(db: Session, query: str, limit: int = 10) -> List[User]:
        search_term = f"%{query}%"
        return db.query(User).filter(
            or_(
                User.username.ilike(search_term),
                User.email.ilike(search_term)
            ),
            User.is_active == True
        ).limit(limit).all()
    
    @staticmethod
    def admin_update_user(db: Session, user_id: int, update_data: UserAdminUpdate) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        
        update_dict = update_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            if hasattr(user, field):
                setattr(user, field, value)
        
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def delete_user(db: Session, user_id: int, soft_delete: bool = True) -> bool:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return False
        
        if soft_delete:
            user.is_active = False
            user.updated_at = datetime.utcnow()
            db.commit()
        else:
            db.delete(user)
            db.commit()
        
        return True
    
    @staticmethod
    def bulk_action(db: Session, action: UserBulkAction) -> dict:
        results = {"success": 0, "failed": 0, "errors": []}
        
        for user_id in action.user_ids:
            try:
                if action.action == "deactivate":
                    success = UserService.delete_user(db, user_id, soft_delete=True)
                elif action.action == "delete":
                    success = UserService.delete_user(db, user_id, soft_delete=False)
                elif action.action == "activate":
                    success = UserService.admin_update_user(
                        db, user_id, UserAdminUpdate(is_active=True)
                    )
                elif action.action == "change_role":
                    success = UserService.admin_update_user(
                        db, user_id, UserAdminUpdate(role=action.role)
                    )
                else:
                    results["errors"].append(f"Unknown action: {action.action}")
                    results["failed"] += 1
                    continue
                
                if success:
                    results["success"] += 1
                else:
                    results["failed"] += 1
                    results["errors"].append(f"User {user_id} not found")
                    
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Error processing user {user_id}: {str(e)}")
        
        return results
    
    @staticmethod
    def export_users(db: Session, format: str, filters: UserFilter) -> str:
        users, _ = UserService.list_users(db, skip=0, limit=10000, filters=filters)
        
        # Convert to DataFrame
        data = []
        for user in users:
            data.append({
                "ID": user.id,
                "Username": user.username,
                "Email": user.email,
                "First Name": user.first_name,
                "Last Name": user.last_name,
                "Role": user.role,
                "Is Active": user.is_active,
                "Email Verified": user.email_verified,
                "Created At": user.created_at,
                "Last Login": user.last_login
            })
        
        df = pd.DataFrame(data)
        
        # Export
        export_dir = Path("exports")
        export_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if format == "csv":
            file_path = export_dir / f"users_{timestamp}.csv"
            df.to_csv(file_path, index=False)
        elif format == "json":
            file_path = export_dir / f"users_{timestamp}.json"
            df.to_json(file_path, orient="records", indent=2)
        elif format == "xlsx":
            file_path = export_dir / f"users_{timestamp}.xlsx"
            df.to_excel(file_path, index=False)
        
        return str(file_path)
    
    @staticmethod
    def get_user_activity(db: Session, user_id: int, days: int = 30) -> List[dict]:
        since = datetime.utcnow() - timedelta(days=days)
        
        activities = db.query(UserActivity).filter(
            UserActivity.user_id == user_id,
            UserActivity.created_at >= since
        ).order_by(UserActivity.created_at.desc()).all()
        
        return [
            {
                "id": a.id,
                "type": a.activity_type,
                "data": a.activity_data,
                "created_at": a.created_at
            }
            for a in activities
        ]
```

#### 3. `/backend/schemas/user.py`
**Nội dung:**
```python
from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum

class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class UserRole(str, Enum):
    ADMIN = "admin"
    LIBRARIAN = "librarian"
    USER = "user"

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole = UserRole.USER

class UserProfile(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    gender: Optional[Gender] = None
    bio: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    role: UserRole
    is_active: bool
    email_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    preferences: Dict[str, Any] = {}
    settings: Dict[str, Any] = {}

class UserProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    gender: Optional[Gender] = None
    bio: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    zipcode: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    notification_enabled: Optional[bool] = None

class UserFilter(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    email_verified: Optional[bool] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    search: Optional[str] = None

class UserAdminUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    email_verified: Optional[bool] = None
    locked_until: Optional[datetime] = None

class BulkAction(str, Enum):
    ACTIVATE = "activate"
    DEACTIVATE = "deactivate"
    DELETE = "delete"
    CHANGE_ROLE = "change_role"

class UserBulkAction(BaseModel):
    user_ids: List[int]
    action: BulkAction
    role: Optional[UserRole] = None  # Required when action is CHANGE_ROLE

class UserList(BaseModel):
    users: List[UserProfile]
    total: int
    skip: int
    limit: int
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 4. `/frontend/src/pages/ProfilePage.js`
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import UserProfileForm from '../components/users/UserProfileForm';
import AvatarUpload from '../components/users/AvatarUpload';
import UserStats from '../components/users/UserStats';

const ProfilePage = () => {
    const { user, token } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('profile');

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const response = await fetch('/users/profile/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setProfile(data);
        } catch (error) {
            console.error('Failed to fetch profile:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;
    if (!profile) return <div>Error loading profile</div>;

    return (
        <div className="profile-page">
            <div className="profile-header">
                <AvatarUpload 
                    currentAvatar={profile.avatar_url} 
                    onAvatarUpdate={fetchProfile}
                />
                <div className="profile-info">
                    <h1>{profile.full_name || profile.username}</h1>
                    <p className="username">@{profile.username}</p>
                    <p className="role">{profile.role}</p>
                </div>
            </div>

            <div className="profile-tabs">
                <button 
                    className={activeTab === 'profile' ? 'active' : ''}
                    onClick={() => setActiveTab('profile')}
                >
                    Thông tin cá nhân
                </button>
                <button 
                    className={activeTab === 'stats' ? 'active' : ''}
                    onClick={() => setActiveTab('stats')}
                >
                    Thống kê
                </button>
                <button 
                    className={activeTab === 'settings' ? 'active' : ''}
                    onClick={() => setActiveTab('settings')}
                >
                    Cài đặt
                </button>
            </div>

            <div className="profile-content">
                {activeTab === 'profile' && (
                    <UserProfileForm 
                        profile={profile} 
                        onUpdate={fetchProfile}
                    />
                )}
                {activeTab === 'stats' && (
                    <UserStats userId={profile.id} />
                )}
                {activeTab === 'settings' && (
                    <UserSettings profile={profile} />
                )}
            </div>
        </div>
    );
};

export default ProfilePage;
```

#### 5. `/frontend/src/components/users/UserProfileForm.js`
**Nội dung:**
```javascript
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const UserProfileForm = ({ profile, onUpdate }) => {
    const { token } = useAuth();
    const [formData, setFormData] = useState({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
        birth_date: profile.birth_date || '',
        gender: profile.gender || '',
        bio: profile.bio || '',
        address: profile.address || '',
        city: profile.city || '',
        country: profile.country || ''
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');

        try {
            const response = await fetch('/users/profile/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                setMessage('Cập nhật thành công!');
                onUpdate();
            } else {
                setMessage('Cập nhật thất bại!');
            }
        } catch (error) {
            setMessage('Lỗi kết nối!');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="profile-form">
            {message && <div className="message">{message}</div>}
            
            <div className="form-row">
                <div className="form-group">
                    <label>Họ</label>
                    <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                    />
                </div>
                <div className="form-group">
                    <label>Tên</label>
                    <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                    />
                </div>
            </div>

            <div className="form-group">
                <label>Số điện thoại</label>
                <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Ngày sinh</label>
                    <input
                        type="date"
                        name="birth_date"
                        value={formData.birth_date}
                        onChange={handleChange}
                    />
                </div>
                <div className="form-group">
                    <label>Giới tính</label>
                    <select name="gender" value={formData.gender} onChange={handleChange}>
                        <option value="">Chọn</option>
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                    </select>
                </div>
            </div>

            <div className="form-group">
                <label>Giới thiệu</label>
                <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    rows="3"
                />
            </div>

            <div className="form-group">
                <label>Địa chỉ</label>
                <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Thành phố</label>
                    <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                    />
                </div>
                <div className="form-group">
                    <label>Quốc gia</label>
                    <input
                        type="text"
                        name="country"
                        value={formData.country}
                        onChange={handleChange}
                    />
                </div>
            </div>

            <button type="submit" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
        </form>
    );
};

export default UserProfileForm;
```

#### 6. `/frontend/src/components/users/AvatarUpload.js`
**Nội dung:**
```javascript
import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

const AvatarUpload = ({ currentAvatar, onAvatarUpdate }) => {
    const { token } = useAuth();
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(currentAvatar);
    const fileInputRef = useRef(null);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Preview
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result);
        reader.readAsDataURL(file);

        // Upload
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/users/profile/me/avatar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                setPreview(data.avatar_url);
                onAvatarUpdate();
            }
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        try {
            const response = await fetch('/users/profile/me/avatar', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                setPreview(null);
                onAvatarUpdate();
            }
        } catch (error) {
            console.error('Delete failed:', error);
        }
    };

    return (
        <div className="avatar-upload">
            <div className="avatar-preview">
                {preview ? (
                    <img src={preview} alt="Avatar" />
                ) : (
                    <div className="avatar-placeholder">👤</div>
                )}
                {uploading && <div className="upload-overlay">Đang tải...</div>}
            </div>
            
            <div className="avatar-actions">
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    {preview ? 'Thay đổi' : 'Tải lên'}
                </button>
                {preview && (
                    <button onClick={handleDelete} className="delete-btn">
                        Xóa
                    </button>
                )}
            </div>
            
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: 'none' }}
            />
        </div>
    );
};

export default AvatarUpload;
```

#### 7. `/frontend/src/pages/AdminUsersPage.js`
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import UserTable from '../components/admin/UserTable';
import UserFilters from '../components/admin/UserFilters';

const AdminUsersPage = () => {
    const { token } = useAuth();
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        skip: 0,
        limit: 20,
        role: '',
        is_active: '',
        search: ''
    });

    useEffect(() => {
        fetchUsers();
    }, [filters]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            const response = await fetch(`/users/?${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setUsers(data.users);
            setTotal(data.total);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkAction = async (action, userIds) => {
        try {
            const response = await fetch('/users/bulk-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_ids: userIds, action })
            });

            if (response.ok) {
                fetchUsers(); // Refresh list
            }
        } catch (error) {
            console.error('Bulk action failed:', error);
        }
    };

    return (
        <div className="admin-users-page">
            <h1>Quản lý người dùng</h1>
            
            <UserFilters filters={filters} onChange={setFilters} />
            
            <UserTable 
                users={users}
                total={total}
                loading={loading}
                filters={filters}
                onPageChange={(skip) => setFilters({ ...filters, skip })}
                onBulkAction={handleBulkAction}
                onRefresh={fetchUsers}
            />
        </div>
    );
};

export default AdminUsersPage;
```

## Dependencies Required

### Backend
```
pandas==2.0.3
openpyxl==3.1.2  # For Excel export
python-multipart==0.0.6  # For file upload
Pillow==10.0.0  # For image processing
```

### Frontend
```bash
npm install react-image-crop  # For avatar cropping
```

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | /users/profile/me | Get my profile | Authenticated |
| PUT | /users/profile/me | Update my profile | Authenticated |
| POST | /users/profile/me/avatar | Upload avatar | Authenticated |
| DELETE | /users/profile/me/avatar | Delete avatar | Authenticated |
| GET | /users/profile/{id} | Get user profile | Authenticated |
| GET | /users/ | List users | Librarian+ |
| GET | /users/search | Search users | Authenticated |
| PUT | /users/{id} | Update user | Admin |
| DELETE | /users/{id} | Delete user | Admin |
| POST | /users/bulk-action | Bulk actions | Admin |
| GET | /users/export | Export users | Admin |
| GET | /users/{id}/activity | User activity | Owner/Admin |

## Testing Checklist
- [ ] View own profile
- [ ] Update profile information
- [ ] Upload avatar (with validation)
- [ ] View other user profiles (privacy)
- [ ] List users with filters
- [ ] Search users
- [ ] Admin update any user
- [ ] Delete user (soft & hard)
- [ ] Bulk actions
- [ ] Export users to CSV/Excel/JSON
- [ ] View user activity history
