# Feature: Notification System (Hệ thống thông báo)

## Overview
Hệ thống thông báo real-time cho Quiz App với email, push notification và in-app notifications.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/services/notification_service.py`
**Nội dung:**
```python
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import json

from models.notification import Notification, NotificationSetting, NotificationDevice
from models.user import User

class NotificationService:
    
    NOTIFICATION_TEMPLATES = {
        'QUIZ_COMPLETE': {
            'title': 'Bài thi hoàn thành',
            'message': 'Bạn đã hoàn thành bài thi "{quiz_title}" với điểm {score}%'
        },
        'NEW_QUIZ': {
            'title': 'Đề thi mới',
            'message': 'Có đề thi mới "{quiz_title}" phù hợp với bạn'
        },
        'RATING': {
            'title': 'Đánh giá mới',
            'message': '{username} đã đánh giá đề thi của bạn: {rating} sao'
        },
        'COMMENT': {
            'title': 'Bình luận mới',
            'message': '{username} đã bình luận về đề thi của bạn'
        },
        'MENTION': {
            'title': 'Đề cập đến bạn',
            'message': '{username} đã nhắc đến bạn trong một bình luận'
        },
        'SYSTEM': {
            'title': 'Thông báo hệ thống',
            'message': '{message}'
        }
    }
    
    @staticmethod
    def create_notification(
        db: Session,
        user_id: int,
        notification_type: str,
        title: str = None,
        message: str = None,
        data: dict = None,
        action_url: str = None,
        priority: str = 'NORMAL'
    ) -> Notification:
        """Create new notification."""
        # Check user preferences
        settings = db.query(NotificationSetting).filter(
            NotificationSetting.user_id == user_id
        ).first()
        
        if settings:
            # Check if this notification type is enabled
            type_enabled = getattr(settings, f'{notification_type.lower()}_notifications', True)
            if not type_enabled:
                return None
        
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title or NotificationService.NOTIFICATION_TEMPLATES.get(notification_type, {}).get('title', 'Notification'),
            message=message,
            data=json.dumps(data) if data else None,
            action_url=action_url,
            priority=priority,
            created_at=datetime.utcnow()
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        
        # Send real-time notification
        NotificationService.send_realtime_notification(notification)
        
        return notification
    
    @staticmethod
    def notify_quiz_completed(db: Session, user_id: int, quiz_title: str, score: float):
        """Send quiz completion notification."""
        template = NotificationService.NOTIFICATION_TEMPLATES['QUIZ_COMPLETE']
        message = template['message'].format(quiz_title=quiz_title, score=score)
        
        return NotificationService.create_notification(
            db, user_id, 'QUIZ_COMPLETE',
            title=template['title'],
            message=message,
            data={'quiz_title': quiz_title, 'score': score},
            action_url=f'/results'
        )
    
    @staticmethod
    def notify_new_quiz(db: Session, quiz_id: int, quiz_title: str):
        """Notify users about new quiz."""
        template = NotificationService.NOTIFICATION_TEMPLATES['NEW_QUIZ']
        message = template['message'].format(quiz_title=quiz_title)
        
        # Get all active users
        users = db.query(User).filter(User.is_active == True).all()
        
        notifications = []
        for user in users:
            notif = NotificationService.create_notification(
                db, user.id, 'NEW_QUIZ',
                title=template['title'],
                message=message,
                data={'quiz_id': quiz_id, 'quiz_title': quiz_title},
                action_url=f'/quiz/{quiz_id}'
            )
            if notif:
                notifications.append(notif)
        
        return notifications
    
    @staticmethod
    def get_user_notifications(
        db: Session,
        user_id: int,
        unread_only: bool = False,
        limit: int = 20
    ) -> List[Notification]:
        """Get notifications for user."""
        query = db.query(Notification).filter(
            Notification.user_id == user_id
        )
        
        if unread_only:
            query = query.filter(Notification.is_read == False)
        
        return query.order_by(Notification.created_at.desc()).limit(limit).all()
    
    @staticmethod
    def mark_as_read(db: Session, notification_id: int, user_id: int) -> bool:
        """Mark notification as read."""
        notification = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if not notification:
            return False
        
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.commit()
        return True
    
    @staticmethod
    def mark_all_as_read(db: Session, user_id: int) -> int:
        """Mark all notifications as read."""
        notifications = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).all()
        
        for notif in notifications:
            notif.is_read = True
            notif.read_at = datetime.utcnow()
        
        db.commit()
        return len(notifications)
    
    @staticmethod
    def delete_notification(db: Session, notification_id: int, user_id: int) -> bool:
        """Delete notification."""
        notification = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if not notification:
            return False
        
        db.delete(notification)
        db.commit()
        return True
    
    @staticmethod
    def get_unread_count(db: Session, user_id: int) -> int:
        """Get count of unread notifications."""
        return db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).count()
    
    @staticmethod
    def send_realtime_notification(notification: Notification):
        """Send notification via WebSocket."""
        # This will be implemented with WebSocket manager
        from services.websocket_manager import manager
        
        manager.send_personal_message({
            'type': 'notification',
            'data': {
                'id': notification.id,
                'type': notification.type,
                'title': notification.title,
                'message': notification.message,
                'action_url': notification.action_url,
                'created_at': notification.created_at.isoformat()
            }
        }, notification.user_id)
```

#### 2. `/backend/routers/notifications.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.user import User
from services.notification_service import NotificationService
from routers.auth import get_current_active_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("/")
async def get_notifications(
    unread_only: bool = False,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get user notifications."""
    notifications = NotificationService.get_user_notifications(
        db, current_user.id, unread_only, limit
    )
    return {
        'notifications': notifications,
        'unread_count': NotificationService.get_unread_count(db, current_user.id)
    }

@router.get("/unread-count")
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get unread notification count."""
    count = NotificationService.get_unread_count(db, current_user.id)
    return {'unread_count': count}

@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Mark notification as read."""
    success = NotificationService.mark_as_read(db, notification_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {'message': 'Marked as read'}

@router.put("/read-all")
async def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Mark all notifications as read."""
    count = NotificationService.mark_all_as_read(db, current_user.id)
    return {'marked_as_read': count}

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete notification."""
    success = NotificationService.delete_notification(db, notification_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {'message': 'Notification deleted'}

@router.get("/settings")
async def get_notification_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get notification settings."""
    from models.notification import NotificationSetting
    
    settings = db.query(NotificationSetting).filter(
        NotificationSetting.user_id == current_user.id
    ).first()
    
    if not settings:
        # Create default settings
        settings = NotificationSetting(user_id=current_user.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings

@router.put("/settings")
async def update_notification_settings(
    settings_update: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update notification settings."""
    from models.notification import NotificationSetting
    
    settings = db.query(NotificationSetting).filter(
        NotificationSetting.user_id == current_user.id
    ).first()
    
    if not settings:
        settings = NotificationSetting(user_id=current_user.id)
        db.add(settings)
    
    for key, value in settings_update.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    
    return settings
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 3. `/frontend/src/components/notifications/NotificationBell.js`
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const NotificationBell = () => {
    const { token, user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchUnreadCount = async () => {
        const response = await fetch('/notifications/unread-count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        setUnreadCount(data.unread_count);
    };

    const fetchNotifications = async () => {
        const response = await fetch('/notifications/?unread_only=false&limit=10', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        setNotifications(data.notifications);
    };

    const handleClick = () => {
        setShowDropdown(!showDropdown);
        if (!showDropdown) {
            fetchNotifications();
        }
    };

    const markAsRead = async (id) => {
        await fetch(`/notifications/${id}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchUnreadCount();
        fetchNotifications();
    };

    const markAllAsRead = async () => {
        await fetch('/notifications/read-all', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchUnreadCount();
        fetchNotifications();
    };

    return (
        <div className="notification-bell">
            <button className="bell-btn" onClick={handleClick}>
                🔔
                {unreadCount > 0 && (
                    <span className="badge">{unreadCount}</span>
                )}
            </button>
            
            {showDropdown && (
                <div className="notification-dropdown">
                    <div className="dropdown-header">
                        <h4>Thông báo</h4>
                        {unreadCount > 0 && (
                            <button onClick={markAllAsRead}>
                                Đánh dấu đã đọc tất cả
                            </button>
                        )}
                    </div>
                    
                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <p className="no-notifications">Không có thông báo</p>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                                    onClick={() => markAsRead(n.id)}
                                >
                                    <h5>{n.title}</h5>
                                    <p>{n.message}</p>
                                    <span className="time">
                                        {new Date(n.created_at).toLocaleString('vi-VN')}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
```

## Features
- **Real-time notifications**: WebSocket-based delivery
- **Notification types**: Quiz complete, new quiz, ratings, comments, mentions, system
- **Notification settings**: User can customize preferences
- **Unread count**: Real-time badge update
- **Mark as read**: Individual or bulk actions
- **Email integration**: Optional email notifications

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | /notifications/ | Get notifications | Authenticated |
| GET | /notifications/unread-count | Get unread count | Authenticated |
| PUT | /notifications/{id}/read | Mark as read | Authenticated |
| PUT | /notifications/read-all | Mark all as read | Authenticated |
| DELETE | /notifications/{id} | Delete notification | Authenticated |
| GET | /notifications/settings | Get settings | Authenticated |
| PUT | /notifications/settings | Update settings | Authenticated |

## Testing Checklist
- [ ] Create notification
- [ ] Receive real-time notification
- [ ] Get notification list
- [ ] Mark as read
- [ ] Mark all as read
- [ ] Delete notification
- [ ] Notification settings
- [ ] Unread count badge
