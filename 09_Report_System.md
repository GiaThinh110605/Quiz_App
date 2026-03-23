# Feature: Report System (Báo cáo và xuất dữ liệu)

## Overview
Hệ thống báo cáo và xuất dữ liệu cho Quiz App với nhiều định dạng (PDF, Excel, CSV) và các loại báo cáo khác nhau.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/services/report_service.py`
**Nội dung:**
```python
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, desc
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pandas as pd
import io
from pathlib import Path

from models.statistics import QuizAttempt, UserActivity, DailyStats
from models.user import User
from models.quiz import Quiz

class ReportService:
    
    @staticmethod
    def generate_user_performance_report(
        db: Session,
        user_id: int,
        start_date: datetime,
        end_date: datetime
    ) -> Dict:
        """Generate detailed user performance report."""
        
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.completed_at >= start_date,
            QuizAttempt.completed_at <= end_date
        ).all()
        
        if not attempts:
            return None
        
        user = db.query(User).filter(User.id == user_id).first()
        
        # Calculate statistics
        scores = [a.score for a in attempts]
        times = [a.time_taken for a in attempts]
        
        # Category breakdown
        categories = {}
        for attempt in attempts:
            cat = attempt.quiz.category if attempt.quiz else 'Unknown'
            if cat not in categories:
                categories[cat] = {'attempts': 0, 'total_score': 0, 'best_score': 0}
            categories[cat]['attempts'] += 1
            categories[cat]['total_score'] += attempt.score
            categories[cat]['best_score'] = max(categories[cat]['best_score'], attempt.score)
        
        for cat in categories:
            categories[cat]['avg_score'] = categories[cat]['total_score'] / categories[cat]['attempts']
        
        # Weekly progress
        weekly_data = {}
        for attempt in attempts:
            week = attempt.completed_at.strftime('%Y-W%U')
            if week not in weekly_data:
                weekly_data[week] = {'count': 0, 'total_score': 0}
            weekly_data[week]['count'] += 1
            weekly_data[week]['total_score'] += attempt.score
        
        return {
            'user_info': {
                'id': user.id,
                'username': user.username,
                'full_name': f"{user.first_name or ''} {user.last_name or ''}".strip(),
                'email': user.email,
                'role': user.role
            },
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            },
            'summary': {
                'total_attempts': len(attempts),
                'average_score': sum(scores) / len(scores) if scores else 0,
                'best_score': max(scores) if scores else 0,
                'worst_score': min(scores) if scores else 0,
                'total_time': sum(times),
                'average_time': sum(times) / len(times) if times else 0,
                'pass_count': len([s for s in scores if s >= 60]),
                'fail_count': len([s for s in scores if s < 60])
            },
            'category_breakdown': categories,
            'weekly_progress': [
                {'week': k, 'attempts': v['count'], 'avg_score': v['total_score'] / v['count']}
                for k, v in sorted(weekly_data.items())
            ],
            'attempts': [
                {
                    'id': a.id,
                    'quiz_id': a.quiz_id,
                    'quiz_title': a.quiz.title if a.quiz else 'Unknown',
                    'score': a.score,
                    'correct_answers': a.correct_answers,
                    'total_questions': a.total_questions,
                    'time_taken': a.time_taken,
                    'completed_at': a.completed_at.isoformat()
                }
                for a in sorted(attempts, key=lambda x: x.completed_at)
            ]
        }
    
    @staticmethod
    def generate_system_report(
        db: Session,
        start_date: datetime,
        end_date: datetime
    ) -> Dict:
        """Generate system-wide report."""
        
        # User statistics
        total_users = db.query(User).filter(
            User.created_at <= end_date
        ).count()
        
        new_users = db.query(User).filter(
            User.created_at >= start_date,
            User.created_at <= end_date
        ).count()
        
        active_users = db.query(UserActivity).filter(
            UserActivity.created_at >= start_date,
            UserActivity.created_at <= end_date
        ).distinct(UserActivity.user_id).count()
        
        # Quiz statistics
        total_quizzes = db.query(Quiz).filter(
            Quiz.created_at <= end_date
        ).count()
        
        new_quizzes = db.query(Quiz).filter(
            Quiz.created_at >= start_date,
            Quiz.created_at <= end_date
        ).count()
        
        # Attempt statistics
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.completed_at >= start_date,
            QuizAttempt.completed_at <= end_date
        ).all()
        
        scores = [a.score for a in attempts]
        
        # Daily breakdown
        daily_stats = db.query(DailyStats).filter(
            DailyStats.date >= start_date.date(),
            DailyStats.date <= end_date.date()
        ).order_by(DailyStats.date).all()
        
        # Top users
        top_users = db.query(
            User.id,
            User.username,
            func.count(QuizAttempt.id).label('attempt_count'),
            func.avg(QuizAttempt.score).label('avg_score')
        ).join(QuizAttempt).filter(
            QuizAttempt.completed_at >= start_date,
            QuizAttempt.completed_at <= end_date
        ).group_by(User.id).order_by(desc('attempt_count')).limit(10).all()
        
        # Popular quizzes
        popular_quizzes = db.query(
            Quiz.id,
            Quiz.title,
            func.count(QuizAttempt.id).label('attempt_count'),
            func.avg(QuizAttempt.score).label('avg_score')
        ).join(QuizAttempt).filter(
            QuizAttempt.completed_at >= start_date,
            QuizAttempt.completed_at <= end_date
        ).group_by(Quiz.id).order_by(desc('attempt_count')).limit(10).all()
        
        return {
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            },
            'users': {
                'total': total_users,
                'new': new_users,
                'active': active_users
            },
            'quizzes': {
                'total': total_quizzes,
                'new': new_quizzes
            },
            'attempts': {
                'total': len(attempts),
                'average_score': sum(scores) / len(scores) if scores else 0,
                'pass_rate': len([s for s in scores if s >= 60]) / len(scores) * 100 if scores else 0
            },
            'daily_stats': [
                {
                    'date': s.date.isoformat(),
                    'attempts': s.total_attempts,
                    'users': s.total_users,
                    'avg_score': s.average_score,
                    'new_users': s.new_users
                }
                for s in daily_stats
            ],
            'top_users': [
                {
                    'id': u.id,
                    'username': u.username,
                    'attempts': u.attempt_count,
                    'avg_score': float(u.avg_score)
                }
                for u in top_users
            ],
            'popular_quizzes': [
                {
                    'id': q.id,
                    'title': q.title,
                    'attempts': q.attempt_count,
                    'avg_score': float(q.avg_score)
                }
                for q in popular_quizzes
            ]
        }
    
    @staticmethod
    def export_to_excel(db: Session, report_data: Dict, report_type: str) -> bytes:
        """Export report to Excel format."""
        
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Summary sheet
            summary_df = pd.DataFrame([report_data.get('summary', {})])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Attempts sheet
            if 'attempts' in report_data:
                attempts_df = pd.DataFrame(report_data['attempts'])
                attempts_df.to_excel(writer, sheet_name='Attempts', index=False)
            
            # Weekly progress sheet
            if 'weekly_progress' in report_data:
                weekly_df = pd.DataFrame(report_data['weekly_progress'])
                weekly_df.to_excel(writer, sheet_name='Weekly Progress', index=False)
            
            # Category breakdown sheet
            if 'category_breakdown' in report_data:
                cat_data = [
                    {'category': k, **v}
                    for k, v in report_data['category_breakdown'].items()
                ]
                cat_df = pd.DataFrame(cat_data)
                cat_df.to_excel(writer, sheet_name='Categories', index=False)
        
        output.seek(0)
        return output.getvalue()
    
    @staticmethod
    def export_to_csv(db: Session, report_data: Dict) -> str:
        """Export report to CSV format."""
        
        if 'attempts' in report_data:
            df = pd.DataFrame(report_data['attempts'])
            return df.to_csv(index=False)
        return ""
```

#### 2. `/backend/routers/reports.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from io import BytesIO

from database import get_db
from models.user import User
from services.report_service import ReportService
from routers.auth import get_current_active_user, require_admin, require_librarian

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/user/{user_id}")
async def get_user_report(
    user_id: int,
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    format: str = Query('json', regex='^(json|excel|csv)$'),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate user performance report."""
    
    # Check permissions
    if current_user.id != user_id and current_user.role not in ["admin", "librarian"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    report = ReportService.generate_user_performance_report(
        db, user_id, start_date, end_date
    )
    
    if not report:
        raise HTTPException(status_code=404, detail="No data found for this period")
    
    if format == 'excel':
        excel_data = ReportService.export_to_excel(db, report, 'user')
        return StreamingResponse(
            BytesIO(excel_data),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename=user_report_{user_id}.xlsx'}
        )
    elif format == 'csv':
        csv_data = ReportService.export_to_csv(db, report)
        return StreamingResponse(
            io.StringIO(csv_data),
            media_type='text/csv',
            headers={'Content-Disposition': f'attachment; filename=user_report_{user_id}.csv'}
        )
    
    return report

@router.get("/system")
async def get_system_report(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    format: str = Query('json', regex='^(json|excel|csv)$'),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Generate system report (admin only)."""
    
    report = ReportService.generate_system_report(db, start_date, end_date)
    
    if format == 'excel':
        excel_data = ReportService.export_to_excel(db, report, 'system')
        return StreamingResponse(
            BytesIO(excel_data),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=system_report.xlsx'}
        )
    elif format == 'csv':
        csv_data = ReportService.export_to_csv(db, report)
        return StreamingResponse(
            io.StringIO(csv_data),
            media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename=system_report.csv'}
        )
    
    return report

@router.get("/quiz/{quiz_id}")
async def get_quiz_report(
    quiz_id: int,
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Generate quiz performance report."""
    
    # Get quiz attempts
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.completed_at >= start_date,
        QuizAttempt.completed_at <= end_date
    ).all()
    
    if not attempts:
        raise HTTPException(status_code=404, detail="No attempts found for this quiz")
    
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    
    scores = [a.score for a in attempts]
    
    return {
        'quiz_info': {
            'id': quiz.id,
            'title': quiz.title,
            'category': quiz.category,
            'total_questions': quiz.total_questions
        },
        'period': {
            'start': start_date.isoformat(),
            'end': end_date.isoformat()
        },
        'summary': {
            'total_attempts': len(attempts),
            'unique_users': len(set(a.user_id for a in attempts)),
            'average_score': sum(scores) / len(scores),
            'highest_score': max(scores),
            'lowest_score': min(scores),
            'pass_rate': len([s for s in scores if s >= quiz.passing_score]) / len(scores) * 100
        },
        'attempts': [
            {
                'user_id': a.user_id,
                'username': a.user.username,
                'score': a.score,
                'correct_answers': a.correct_answers,
                'time_taken': a.time_taken,
                'completed_at': a.completed_at.isoformat()
            }
            for a in attempts
        ]
    }
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 3. `/frontend/src/pages/ReportsPage.js`
**Nội dung:**
```javascript
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ReportFilters from '../components/reports/ReportFilters';

const ReportsPage = () => {
    const { token, user } = useAuth();
    const [reportType, setReportType] = useState('user');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState(null);

    const generateReport = async (filters) => {
        setLoading(true);
        try {
            let endpoint = '';
            if (reportType === 'user') {
                endpoint = `/reports/user/${user.id}?`;
            } else if (reportType === 'system' && user.role === 'admin') {
                endpoint = '/reports/system?';
            }

            const queryParams = new URLSearchParams({
                start_date: filters.startDate,
                end_date: filters.endDate,
                format: filters.format
            });

            const response = await fetch(`${endpoint}${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (filters.format === 'json') {
                const data = await response.json();
                setReportData(data);
            } else {
                // Download file
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `report_${reportType}.${filters.format}`;
                a.click();
            }
        } catch (error) {
            console.error('Failed to generate report:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="reports-page">
            <h1>Báo cáo</h1>
            
            <div className="report-type-selector">
                <button
                    className={reportType === 'user' ? 'active' : ''}
                    onClick={() => setReportType('user')}
                >
                    Báo cáo cá nhân
                </button>
                {user.role === 'admin' && (
                    <button
                        className={reportType === 'system' ? 'active' : ''}
                        onClick={() => setReportType('system')}
                    >
                        Báo cáo hệ thống
                    </button>
                )}
            </div>

            <ReportFilters onGenerate={generateReport} loading={loading} />

            {reportData && (
                <div className="report-preview">
                    <h2>Kết quả báo cáo</h2>
                    <pre>{JSON.stringify(reportData, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

export default ReportsPage;
```

## Dependencies Required

### Backend
```
pandas==2.0.3
openpyxl==3.1.2
```

## Report Types
- **User Report**: Individual performance metrics
- **System Report**: Admin dashboard statistics
- **Quiz Report**: Quiz-specific analytics

## Export Formats
- **JSON**: API response format
- **Excel**: Spreadsheet with multiple sheets
- **CSV**: Simple text format

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | /reports/user/{id} | User report | Owner/Admin |
| GET | /reports/system | System report | Admin |
| GET | /reports/quiz/{id} | Quiz report | Librarian+ |

## Testing Checklist
- [ ] Generate user report
- [ ] Generate system report
- [ ] Export to Excel
- [ ] Export to CSV
- [ ] Date range filtering
- [ ] Report data accuracy
