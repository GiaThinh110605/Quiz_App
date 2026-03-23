# Feature: Statistics & Analytics (Thống kê và Phân tích)

## Overview
Hệ thống thống kê và phân tích dữ liệu cho Quiz App, bao gồm thống kê người dùng, bài thi, và dashboard analytics.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/models/statistics.py`
**Nội dung:**
```python
from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String
from sqlalchemy.sql import func
from database import Base

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    score = Column(Float, nullable=False)
    total_questions = Column(Integer, nullable=False)
    correct_answers = Column(Integer, nullable=False)
    time_taken = Column(Integer, nullable=False)  # seconds
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    answers = Column(String, nullable=True)  # JSON string of answers
    
    # Relationships
    user = relationship("User", back_populates="attempts")
    quiz = relationship("Quiz", back_populates="attempts")

class DailyStats(Base):
    __tablename__ = "daily_stats"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime(timezone=True), unique=True, nullable=False)
    total_attempts = Column(Integer, default=0)
    total_users = Column(Integer, default=0)
    average_score = Column(Float, default=0.0)
    new_users = Column(Integer, default=0)
    completed_quizzes = Column(Integer, default=0)

class UserActivity(Base):
    __tablename__ = "user_activities"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    activity_type = Column(String(50), nullable=False)  # 'login', 'quiz_start', 'quiz_complete'
    activity_data = Column(String, nullable=True)  # JSON
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

#### 2. `/backend/schemas/statistics.py`
**Nội dung:**
```python
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class QuizAttemptBase(BaseModel):
    quiz_id: int
    score: float
    total_questions: int
    correct_answers: int
    time_taken: int

class QuizAttemptCreate(QuizAttemptBase):
    answers: Optional[str] = None

class QuizAttemptResponse(QuizAttemptBase):
    id: int
    user_id: int
    started_at: datetime
    completed_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class UserStats(BaseModel):
    user_id: int
    username: str
    total_attempts: int
    average_score: float
    best_score: float
    worst_score: float
    total_time_spent: int
    completion_rate: float
    last_attempt_date: Optional[datetime]
    favorite_quiz_type: Optional[str]
    improvement_rate: float

class QuizStats(BaseModel):
    quiz_id: int
    quiz_title: str
    total_attempts: int
    unique_users: int
    average_score: float
    highest_score: float
    lowest_score: float
    average_time: int
    difficulty_rating: float
    completion_rate: float
    pass_rate: float
    score_distribution: List[dict]

class SystemStats(BaseModel):
    total_users: int
    total_quizzes: int
    total_attempts: int
    active_users_today: int
    active_users_week: int
    active_users_month: int
    average_score_global: float
    total_time_spent: int
    new_users_today: int
    new_users_week: int
    new_users_month: int
    popular_quizzes: List[dict]
    recent_activities: List[dict]

class TimeSeriesData(BaseModel):
    date: datetime
    value: float
    count: int

class DashboardData(BaseModel):
    user_stats: UserStats
    system_stats: SystemStats
    recent_attempts: List[QuizAttemptResponse]
    weekly_progress: List[TimeSeriesData]
    monthly_comparison: dict
```

#### 3. `/backend/services/statistics_service.py`
**Nội dung:**
```python
from sqlalchemy import func, desc, and_, extract
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict
from models.statistics import QuizAttempt, DailyStats, UserActivity
from models.user import User
from models.quiz import Quiz
from schemas.statistics import UserStats, QuizStats, SystemStats, TimeSeriesData

class StatisticsService:
    
    @staticmethod
    def get_user_stats(db: Session, user_id: int) -> UserStats:
        attempts = db.query(QuizAttempt).filter(QuizAttempt.user_id == user_id).all()
        
        if not attempts:
            user = db.query(User).filter(User.id == user_id).first()
            return UserStats(
                user_id=user_id,
                username=user.username if user else "",
                total_attempts=0,
                average_score=0.0,
                best_score=0.0,
                worst_score=0.0,
                total_time_spent=0,
                completion_rate=0.0,
                last_attempt_date=None,
                favorite_quiz_type=None,
                improvement_rate=0.0
            )
        
        user = attempts[0].user
        scores = [attempt.score for attempt in attempts]
        times = [attempt.time_taken for attempt in attempts]
        completed = [a for a in attempts if a.completed_at]
        
        # Calculate improvement rate (last 5 vs first 5 attempts)
        if len(scores) >= 10:
            recent_avg = sum(scores[-5:]) / 5
            early_avg = sum(scores[:5]) / 5
            improvement = ((recent_avg - early_avg) / early_avg) * 100 if early_avg > 0 else 0
        else:
            improvement = 0.0
        
        # Find favorite quiz type
        quiz_types = {}
        for attempt in attempts:
            quiz_type = attempt.quiz.category if attempt.quiz else "unknown"
            quiz_types[quiz_type] = quiz_types.get(quiz_type, 0) + 1
        
        favorite_type = max(quiz_types, key=quiz_types.get) if quiz_types else None
        
        return UserStats(
            user_id=user_id,
            username=user.username,
            total_attempts=len(attempts),
            average_score=sum(scores) / len(scores),
            best_score=max(scores),
            worst_score=min(scores),
            total_time_spent=sum(times),
            completion_rate=(len(completed) / len(attempts)) * 100,
            last_attempt_date=max(a.completed_at for a in completed) if completed else None,
            favorite_quiz_type=favorite_type,
            improvement_rate=improvement
        )
    
    @staticmethod
    def get_quiz_stats(db: Session, quiz_id: int) -> QuizStats:
        attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == quiz_id).all()
        quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
        
        if not attempts or not quiz:
            return QuizStats(
                quiz_id=quiz_id,
                quiz_title=quiz.title if quiz else "Unknown",
                total_attempts=0,
                unique_users=0,
                average_score=0.0,
                highest_score=0.0,
                lowest_score=0.0,
                average_time=0,
                difficulty_rating=0.0,
                completion_rate=0.0,
                pass_rate=0.0,
                score_distribution=[]
            )
        
        scores = [attempt.score for attempt in attempts]
        times = [attempt.time_taken for attempt in attempts]
        unique_users = len(set(a.user_id for a in attempts))
        completed = [a for a in attempts if a.completed_at]
        passed = [s for s in scores if s >= 60]  # Assuming 60 is passing score
        
        # Score distribution
        distribution = []
        ranges = [(0, 20), (20, 40), (40, 60), (60, 80), (80, 100)]
        for min_score, max_score in ranges:
            count = len([s for s in scores if min_score <= s < max_score])
            distribution.append({
                "range": f"{min_score}-{max_score}",
                "count": count,
                "percentage": (count / len(scores)) * 100 if scores else 0
            })
        
        return QuizStats(
            quiz_id=quiz_id,
            quiz_title=quiz.title,
            total_attempts=len(attempts),
            unique_users=unique_users,
            average_score=sum(scores) / len(scores),
            highest_score=max(scores),
            lowest_score=min(scores),
            average_time=sum(times) // len(times),
            difficulty_rating=100 - (sum(scores) / len(scores)) if scores else 0,
            completion_rate=(len(completed) / len(attempts)) * 100,
            pass_rate=(len(passed) / len(scores)) * 100 if scores else 0,
            score_distribution=distribution
        )
    
    @staticmethod
    def get_system_stats(db: Session) -> SystemStats:
        today = datetime.utcnow().date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        total_users = db.query(User).count()
        total_quizzes = db.query(Quiz).count()
        total_attempts = db.query(QuizAttempt).count()
        
        # Active users
        active_today = db.query(UserActivity).filter(
            func.date(UserActivity.created_at) == today
        ).distinct(UserActivity.user_id).count()
        
        active_week = db.query(UserActivity).filter(
            UserActivity.created_at >= week_ago
        ).distinct(UserActivity.user_id).count()
        
        active_month = db.query(UserActivity).filter(
            UserActivity.created_at >= month_ago
        ).distinct(UserActivity.user_id).count()
        
        # New users
        new_today = db.query(User).filter(
            func.date(User.created_at) == today
        ).count()
        
        new_week = db.query(User).filter(
            User.created_at >= week_ago
        ).count()
        
        new_month = db.query(User).filter(
            User.created_at >= month_ago
        ).count()
        
        # Average score
        avg_score = db.query(func.avg(QuizAttempt.score)).scalar() or 0.0
        
        # Total time spent
        total_time = db.query(func.sum(QuizAttempt.time_taken)).scalar() or 0
        
        # Popular quizzes
        popular = db.query(
            Quiz.id,
            Quiz.title,
            func.count(QuizAttempt.id).label('attempt_count')
        ).join(QuizAttempt).group_by(Quiz.id).order_by(desc('attempt_count')).limit(5).all()
        
        popular_quizzes = [
            {"id": q.id, "title": q.title, "attempts": q.attempt_count}
            for q in popular
        ]
        
        # Recent activities
        recent = db.query(UserActivity).order_by(
            desc(UserActivity.created_at)
        ).limit(10).all()
        
        recent_activities = [
            {
                "user_id": a.user_id,
                "type": a.activity_type,
                "data": a.activity_data,
                "time": a.created_at
            }
            for a in recent
        ]
        
        return SystemStats(
            total_users=total_users,
            total_quizzes=total_quizzes,
            total_attempts=total_attempts,
            active_users_today=active_today,
            active_users_week=active_week,
            active_users_month=active_month,
            average_score_global=float(avg_score),
            total_time_spent=int(total_time),
            new_users_today=new_today,
            new_users_week=new_week,
            new_users_month=new_month,
            popular_quizzes=popular_quizzes,
            recent_activities=recent_activities
        )
    
    @staticmethod
    def get_weekly_progress(db: Session, user_id: int) -> List[TimeSeriesData]:
        week_ago = datetime.utcnow() - timedelta(days=7)
        
        daily_data = db.query(
            func.date(QuizAttempt.completed_at).label('date'),
            func.avg(QuizAttempt.score).label('avg_score'),
            func.count(QuizAttempt.id).label('count')
        ).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.completed_at >= week_ago
        ).group_by(
            func.date(QuizAttempt.completed_at)
        ).all()
        
        return [
            TimeSeriesData(
                date=d.date,
                value=float(d.avg_score),
                count=d.count
            )
            for d in daily_data
        ]
    
    @staticmethod
    def record_attempt(db: Session, user_id: int, quiz_id: int, 
                       score: float, total_questions: int, correct_answers: int,
                       time_taken: int, answers: str = None):
        attempt = QuizAttempt(
            user_id=user_id,
            quiz_id=quiz_id,
            score=score,
            total_questions=total_questions,
            correct_answers=correct_answers,
            time_taken=time_taken,
            completed_at=datetime.utcnow(),
            answers=answers
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt
    
    @staticmethod
    def record_activity(db: Session, user_id: int, activity_type: str, activity_data: str = None):
        activity = UserActivity(
            user_id=user_id,
            activity_type=activity_type,
            activity_data=activity_data
        )
        db.add(activity)
        db.commit()
```

#### 4. `/backend/routers/statistics.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from database import get_db
from models.user import User
from schemas.statistics import (
    UserStats, QuizStats, SystemStats, QuizAttemptResponse, 
    DashboardData, TimeSeriesData
)
from services.statistics_service import StatisticsService
from routers.auth import get_current_active_user, require_admin, require_librarian

router = APIRouter(prefix="/stats", tags=["Statistics"])

@router.get("/user/me", response_model=UserStats)
async def get_my_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return StatisticsService.get_user_stats(db, current_user.id)

@router.get("/user/{user_id}", response_model=UserStats)
async def get_user_stats(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Users can only see their own stats unless they're admin/librarian
    if current_user.id != user_id and current_user.role not in ["admin", "librarian"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return StatisticsService.get_user_stats(db, user_id)

@router.get("/quiz/{quiz_id}", response_model=QuizStats)
async def get_quiz_stats(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return StatisticsService.get_quiz_stats(db, quiz_id)

@router.get("/system", response_model=SystemStats)
async def get_system_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return StatisticsService.get_system_stats(db)

@router.get("/overview", response_model=dict)
async def get_overview_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    return StatisticsService.get_system_stats(db).dict()

@router.get("/dashboard", response_model=DashboardData)
async def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    user_stats = StatisticsService.get_user_stats(db, current_user.id)
    system_stats = StatisticsService.get_system_stats(db) if current_user.role == "admin" else None
    weekly_progress = StatisticsService.get_weekly_progress(db, current_user.id)
    
    recent_attempts = db.query(QuizAttempt).filter(
        QuizAttempt.user_id == current_user.id
    ).order_by(QuizAttempt.completed_at.desc()).limit(5).all()
    
    return DashboardData(
        user_stats=user_stats,
        system_stats=system_stats,
        recent_attempts=recent_attempts,
        weekly_progress=weekly_progress,
        monthly_comparison={}
    )

@router.get("/progress/weekly", response_model=List[TimeSeriesData])
async def get_weekly_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return StatisticsService.get_weekly_progress(db, current_user.id)

@router.get("/leaderboard")
async def get_leaderboard(
    period: str = "all_time",  # all_time, weekly, monthly
    limit: int = 10,
    db: Session = Depends(get_db)
):
    if period == "weekly":
        start_date = datetime.utcnow() - timedelta(days=7)
    elif period == "monthly":
        start_date = datetime.utcnow() - timedelta(days=30)
    else:
        start_date = None
    
    query = db.query(
        User.id,
        User.username,
        func.avg(QuizAttempt.score).label('avg_score'),
        func.count(QuizAttempt.id).label('attempts'),
        func.max(QuizAttempt.score).label('best_score')
    ).join(QuizAttempt)
    
    if start_date:
        query = query.filter(QuizAttempt.completed_at >= start_date)
    
    leaderboard = query.group_by(User.id).order_by(
        desc('avg_score')
    ).limit(limit).all()
    
    return [
        {
            "rank": i + 1,
            "user_id": l.id,
            "username": l.username,
            "average_score": round(l.avg_score, 2),
            "attempts": l.attempts,
            "best_score": l.best_score
        }
        for i, l in enumerate(leaderboard)
    ]
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 5. `/frontend/src/components/stats/StatsCard.js`
**Nội dung:**
```javascript
import React from 'react';

const StatsCard = ({ title, value, subtitle, trend, icon, color = 'blue' }) => {
    const colorClasses = {
        blue: 'stats-card-blue',
        green: 'stats-card-green',
        red: 'stats-card-red',
        yellow: 'stats-card-yellow',
        purple: 'stats-card-purple'
    };

    return (
        <div className={`stats-card ${colorClasses[color]}`}>
            <div className="stats-card-header">
                <h3>{title}</h3>
                {icon && <span className="stats-icon">{icon}</span>}
            </div>
            <div className="stats-card-body">
                <div className="stats-value">{value}</div>
                {subtitle && <div className="stats-subtitle">{subtitle}</div>}
            </div>
            {trend !== undefined && (
                <div className={`stats-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
                    {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
                </div>
            )}
        </div>
    );
};

export default StatsCard;
```

#### 6. `/frontend/src/components/stats/ScoreChart.js`
**Nội dung:**
```javascript
import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Title,
    Tooltip,
    Legend
);

export const ScoreDistributionChart = ({ data }) => {
    const chartData = {
        labels: data.map(d => d.range),
        datasets: [{
            label: 'Số lượng',
            data: data.map(d => d.count),
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
        }]
    };

    const options = {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Phân bố điểm số' }
        }
    };

    return <Bar data={chartData} options={options} />;
};

export const ProgressChart = ({ data }) => {
    const chartData = {
        labels: data.map(d => new Date(d.date).toLocaleDateString('vi-VN')),
        datasets: [{
            label: 'Điểm trung bình',
            data: data.map(d => d.value),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.4,
        }]
    };

    const options = {
        responsive: true,
        plugins: {
            legend: { display: true },
            title: { display: true, text: 'Tiến độ học tập' }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100
            }
        }
    };

    return <Line data={chartData} options={options} />;
};
```

#### 7. `/frontend/src/components/stats/Dashboard.js`
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import StatsCard from './StatsCard';
import { ProgressChart, ScoreDistributionChart } from './ScoreChart';

const Dashboard = () => {
    const { user, token } = useAuth();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const response = await fetch('/stats/dashboard', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setDashboardData(data);
        } catch (error) {
            console.error('Failed to fetch dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading dashboard...</div>;
    if (!dashboardData) return <div>Error loading dashboard</div>;

    const { user_stats, system_stats, recent_attempts, weekly_progress } = dashboardData;

    return (
        <div className="dashboard">
            <h1>Dashboard</h1>
            
            {/* User Stats */}
            <section className="user-stats">
                <h2>Thống kê của bạn</h2>
                <div className="stats-grid">
                    <StatsCard
                        title="Tổng bài thi"
                        value={user_stats.total_attempts}
                        subtitle="bài thi đã hoàn thành"
                        icon="📝"
                        color="blue"
                    />
                    <StatsCard
                        title="Điểm trung bình"
                        value={`${user_stats.average_score.toFixed(1)}%`}
                        trend={user_stats.improvement_rate}
                        subtitle="so với tuần trước"
                        icon="📊"
                        color="green"
                    />
                    <StatsCard
                        title="Điểm cao nhất"
                        value={`${user_stats.best_score.toFixed(1)}%`}
                        icon="🏆"
                        color="yellow"
                    />
                    <StatsCard
                        title="Thời gian học"
                        value={`${Math.floor(user_stats.total_time_spent / 60)} phút`}
                        subtitle="tổng thời gian"
                        icon="⏱️"
                        color="purple"
                    />
                </div>
            </section>

            {/* Progress Chart */}
            {weekly_progress.length > 0 && (
                <section className="progress-section">
                    <h2>Tiến độ 7 ngày qua</h2>
                    <ProgressChart data={weekly_progress} />
                </section>
            )}

            {/* Recent Attempts */}
            <section className="recent-attempts">
                <h2>Bài thi gần đây</h2>
                <table className="attempts-table">
                    <thead>
                        <tr>
                            <th>Bài thi</th>
                            <th>Điểm</th>
                            <th>Thời gian</th>
                            <th>Ngày</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recent_attempts.map(attempt => (
                            <tr key={attempt.id}>
                                <td>Bài thi #{attempt.quiz_id}</td>
                                <td className={attempt.score >= 60 ? 'pass' : 'fail'}>
                                    {attempt.score.toFixed(1)}%
                                </td>
                                <td>{Math.floor(attempt.time_taken / 60)} phút</td>
                                <td>{new Date(attempt.completed_at).toLocaleDateString('vi-VN')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* System Stats (Admin only) */}
            {system_stats && user.role === 'admin' && (
                <section className="system-stats">
                    <h2>Thống kê hệ thống</h2>
                    <div className="stats-grid">
                        <StatsCard
                            title="Tổng người dùng"
                            value={system_stats.total_users}
                            icon="👥"
                            color="blue"
                        />
                        <StatsCard
                            title="Tổng bài thi"
                            value={system_stats.total_quizzes}
                            icon="📚"
                            color="green"
                        />
                        <StatsCard
                            title="Hoạt động hôm nay"
                            value={system_stats.active_users_today}
                            icon="🔥"
                            color="red"
                        />
                        <StatsCard
                            title="Người dùng mới"
                            value={system_stats.new_users_today}
                            icon="✨"
                            color="yellow"
                        />
                    </div>
                </section>
            )}
        </div>
    );
};

export default Dashboard;
```

#### 8. `/frontend/src/pages/StatsPage.js`
**Nội dung:**
```javascript
import React, { useState } from 'react';
import Dashboard from '../components/stats/Dashboard';
import Leaderboard from '../components/stats/Leaderboard';
import QuizStats from '../components/stats/QuizStats';

const StatsPage = () => {
    const [activeTab, setActiveTab] = useState('dashboard');

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <Dashboard />;
            case 'leaderboard':
                return <Leaderboard />;
            case 'quiz-stats':
                return <QuizStats />;
            default:
                return <Dashboard />;
        }
    };

    return (
        <div className="stats-page">
            <nav className="stats-nav">
                <button
                    className={activeTab === 'dashboard' ? 'active' : ''}
                    onClick={() => setActiveTab('dashboard')}
                >
                    Dashboard
                </button>
                <button
                    className={activeTab === 'leaderboard' ? 'active' : ''}
                    onClick={() => setActiveTab('leaderboard')}
                >
                    Bảng xếp hạng
                </button>
                <button
                    className={activeTab === 'quiz-stats' ? 'active' : ''}
                    onClick={() => setActiveTab('quiz-stats')}
                >
                    Thống kê bài thi
                </button>
            </nav>
            <div className="stats-content">
                {renderContent()}
            </div>
        </div>
    );
};

export default StatsPage;
```

## Dependencies Required

### Backend
```
pandas==2.0.3
numpy==1.24.3
```

### Frontend
```bash
npm install chart.js react-chartjs-2
```

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | /stats/user/me | Get my statistics | Authenticated |
| GET | /stats/user/{id} | Get user statistics | Authenticated/Admin |
| GET | /stats/quiz/{id} | Get quiz statistics | Authenticated |
| GET | /stats/system | Get system statistics | Admin only |
| GET | /stats/dashboard | Get dashboard data | Authenticated |
| GET | /stats/progress/weekly | Get weekly progress | Authenticated |
| GET | /stats/leaderboard | Get leaderboard | Public |

## Testing Checklist
- [ ] User statistics calculation
- [ ] Quiz statistics calculation
- [ ] System statistics aggregation
- [ ] Weekly progress tracking
- [ ] Leaderboard ranking
- [ ] Score distribution chart
- [ ] Progress chart visualization
- [ ] Dashboard data loading
- [ ] Role-based access to stats
